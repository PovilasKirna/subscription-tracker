import { money } from "../format";
import type { BrokerDetail, Holding, HoldingGroup, HoldingKind, InvestmentsPayload, NetWorthPayload, NetWorthPoint } from "../types";
import { bankConfigured, config, trading212Configured } from "./config";
import { all, type Db, getDb, logImport, one, run } from "./db";
import { accountKey, BankApiError, type EbAccount, fetchBalance, type PsuContext } from "./enableBanking";
import { convert, loadRates, type RateTable, refreshRates } from "./fx";
import { getState, setState } from "./settings";
import { depositAmount, fetchCashFlowPage, fetchPositions, fetchSummary, summarize, Trading212Error } from "./trading212";

// Net worth: the latest value of every holding (bank balances fetched during sync, brokerage
// accounts from their APIs), recorded once per day so a history builds up from the day tracking
// starts. Values are kept in their own currency and converted to the base currency when read.

const DAY = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
/** A value older than this is flagged on the page (the daily cron should refresh it well before). */
const STALE_AFTER = 3 * DAY;

type HoldingInfo = {
  id: string;
  kind: HoldingKind;
  institution: string;
  name: string;
  currency: string | null;
  /** Bank account type (CACC current, SVGS savings, …); null for brokers. */
  subtype?: string | null;
};
type Value = { amountMinor: number; currency: string };

export const bankHoldingId = (key: string) => `bank:${key}`;
/** One Trading 212 account per install (one API key pair). */
export const T212_HOLDING_ID = "t212";

export async function recordValue(db: Db, h: HoldingInfo, v: Value, detail: unknown = null, now = new Date()): Promise<void> {
  const at = now.toISOString();
  await db.batch(
    [
      {
        sql: `INSERT INTO holdings (id, kind, institution, name, currency, subtype, detail_json, last_sync_at, last_error)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
              ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, institution = excluded.institution, name = excluded.name,
                currency = excluded.currency, subtype = COALESCE(excluded.subtype, subtype), detail_json = excluded.detail_json,
                last_sync_at = excluded.last_sync_at, last_error = NULL`,
        args: [h.id, h.kind, h.institution, h.name, v.currency, h.subtype ?? null, detail === null ? null : JSON.stringify(detail), at],
      },
      {
        sql: `INSERT INTO holding_values (holding, date, amount_minor, currency, captured_at) VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(holding, date) DO UPDATE SET
                amount_minor = excluded.amount_minor, currency = excluded.currency, captured_at = excluded.captured_at`,
        args: [h.id, at.slice(0, 10), v.amountMinor, v.currency, at],
      },
    ],
    "write",
  );
}

/** Notes a failed fetch; the holding's previous value keeps counting. */
export async function recordError(db: Db, h: HoldingInfo, message: string): Promise<void> {
  await db.execute({
    sql: `INSERT INTO holdings (id, kind, institution, name, currency, subtype, last_error) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET institution = excluded.institution, name = excluded.name, last_error = excluded.last_error`,
    args: [h.id, h.kind, h.institution, h.name, h.currency, h.subtype ?? null, message.slice(0, 300)],
  });
}

async function capturedToday(db: Db, id: string, now = Date.now()): Promise<boolean> {
  return Boolean(await one(db, "SELECT 1 AS x FROM holding_values WHERE holding = ? AND date = ?", [id, isoDay(now)]));
}

/**
 * Fetches and records one bank account's balance, right after its transactions were synced.
 * Background runs fetch it at most once a day (banks allow only ~4 background requests per account
 * per day, and transactions need those); a sync the user started always does. Never throws: a
 * missing balance must not fail the transaction sync.
 */
export async function captureBankBalance(
  db: Db,
  account: EbAccount,
  session: { aspsp_name: string; required_psu_headers: string | null },
  opts: { psu?: PsuContext } = {},
): Promise<void> {
  const info: HoldingInfo = {
    id: bankHoldingId(accountKey(account)),
    kind: "bank",
    institution: session.aspsp_name,
    name: account.name || account.currency || "Account",
    currency: account.currency ?? null,
    subtype: account.cash_account_type ?? null,
  };
  try {
    if (!opts.psu && (await capturedToday(db, info.id))) return;
    const requiredPsuHeaders = session.required_psu_headers ? (JSON.parse(session.required_psu_headers) as string[]) : [];
    const balance = await fetchBalance(account, { psu: opts.psu, requiredPsuHeaders });
    if (balance) await recordValue(db, info, balance);
    else await recordError(db, info, "The bank didn't return a balance for this account.");
  } catch (e) {
    const message =
      e instanceof BankApiError && e.rateLimited
        ? "The bank's daily limit was reached — the balance updates on the next sync."
        : `Couldn't fetch the balance: ${(e as Error).message}`;
    await recordError(db, info, message).catch(() => undefined);
  }
}

// ---------- Trading 212 ----------

let t212Running: Promise<void> | null = null;

/** Refreshes the Trading 212 account's value and deposit history. Never throws; failures are recorded. */
export function syncTrading212(): Promise<void> {
  if (!trading212Configured()) return Promise.resolve();
  t212Running ??= doSyncTrading212().finally(() => {
    t212Running = null;
  });
  return t212Running;
}

async function doSyncTrading212(): Promise<void> {
  const db = await getDb();
  const info: HoldingInfo = { id: T212_HOLDING_ID, kind: "broker", institution: "Trading 212", name: "Portfolio", currency: null };
  let summaryLine: string;
  try {
    const summary = await fetchSummary();
    // Positions need the "Portfolio" permission; without it the account total still works.
    const positions = await fetchPositions().catch(() => null);
    const s = summarize(summary, positions);
    const detail: BrokerDetail = s.detail;
    await recordValue(db, { ...info, currency: s.currency }, s, detail);
    const count = positions?.length;
    summaryLine = `${money(s.amountMinor / 100, s.currency)}${count === undefined ? "" : ` · ${count} position${count === 1 ? "" : "s"}`}`;
  } catch (e) {
    const message = (e as Error).message;
    await recordError(db, info, message).catch(() => undefined);
    await logTrading212(db, 0, `Failed: ${message}`).catch(() => undefined);
    return;
  }
  const added = await syncCashFlows(db);
  await logTrading212(db, added, summaryLine).catch(() => undefined);
}

/**
 * Notes a pull in the import log (Settings → Data & sync): `inserted` is the deposits and
 * withdrawals it added, `message` the account value or the error. Back-to-back pulls on one day
 * (Refresh clicks) update one row, so they don't push bank syncs out of the short list.
 */
async function logTrading212(db: Db, added: number, message: string, now = Date.now()): Promise<void> {
  const last = await one<{ id: number; source: string; at: string }>(db, "SELECT id, source, at FROM import_log ORDER BY id DESC LIMIT 1");
  if (last?.source === "t212" && last.at.slice(0, 10) === isoDay(now)) {
    await run(db, "UPDATE import_log SET at = datetime('now'), inserted = inserted + ?, message = ? WHERE id = ?", [
      added,
      message,
      last.id,
    ]);
  } else {
    await logImport(db, "t212", { inserted: added, updated: 0, skipped: 0 }, message);
  }
}

/**
 * How far the deposit history has been read (settings state). `latestSeen` is the newest movement
 * ever read, of any type (interest and fees too, though only deposits, withdrawals and transfers
 * are stored), so catching up never depends on which rows happened to be stored.
 */
type CashFlowState = { complete: boolean; cursor: string | null; latestSeen: string | null; error: string | null; at: string };
const CASH_FLOW_STATE = "state.t212.cashFlows" as const;
/** Pages read per run (the API allows 20 requests a minute); a long history is finished over a few runs. */
const MAX_PAGES = 10;

/**
 * Reads deposits and withdrawals, newest first, in two steps sharing one page budget:
 * 1. from the top until reaching movements already read (`latestSeen`), or the end;
 * 2. while the history isn't complete, onwards from where the previous run stopped (`cursor`).
 * The very first run's step 1 is the start of the backfill. Never throws: without the "History"
 * permission the Investments page just has no deposits line. Returns how many movements were new.
 */
async function syncCashFlows(db: Db): Promise<number> {
  const state = await getState<CashFlowState>(db, CASH_FLOW_STATE);
  const seenBefore = state?.latestSeen ?? null;
  let complete = state?.complete ?? false;
  let cursor = state?.cursor ?? null;
  let latestSeen = seenBefore;
  let added = 0;
  const save = (error: string | null) =>
    setState(db, CASH_FLOW_STATE, { complete, cursor, latestSeen, error, at: new Date().toISOString() });
  const read = async (path: string | null) => {
    const r = await fetchCashFlowPage(path);
    added += await insertCashFlows(db, r.items);
    for (const f of r.items) if (!latestSeen || f.dateTime > latestSeen) latestSeen = f.dateTime;
    return r;
  };
  try {
    let budget = MAX_PAGES;
    let next: string | null = null;
    while (budget > 0) {
      const r = await read(next);
      budget--;
      next = r.nextPagePath ?? null;
      if (seenBefore && r.items.some((f) => f.dateTime <= seenBefore)) break; // caught up
      if (!next) {
        // Read all the way down from the top: the whole history is in.
        complete = true;
        cursor = null;
        break;
      }
      if (!seenBefore) cursor = next; // the first pass is the backfill itself
    }
    while (!complete && cursor && budget > 0) {
      const r = await read(cursor);
      budget--;
      cursor = r.nextPagePath ?? null;
      if (!cursor) complete = true;
    }
    await save(null);
  } catch (e) {
    const message =
      e instanceof Trading212Error && e.status === 403
        ? "Give the API key the “History” permission to see your deposits and return."
        : (e as Error).message;
    await save(message).catch(() => undefined);
  }
  return added;
}

/**
 * Stores a page's deposits, withdrawals and transfers (interest and fees are returns, not deposits).
 * Returns how many were new.
 */
async function insertCashFlows(db: Db, items: Awaited<ReturnType<typeof fetchCashFlowPage>>["items"]): Promise<number> {
  const flows = items.flatMap((f) => {
    const amount = depositAmount(f);
    return amount === null ? [] : [{ ...f, amount }];
  });
  if (!flows.length) return 0;
  const results = await db.batch(
    flows.map((f) => ({
      sql: `INSERT INTO broker_cash_flows (holding, reference, date, type, amount_minor, currency) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(holding, reference) DO NOTHING`,
      args: [T212_HOLDING_ID, f.reference, f.dateTime.slice(0, 10), f.type, Math.round(f.amount * 100), f.currency.toUpperCase()],
    })),
    "write",
  );
  return results.reduce((n, r) => n + r.rowsAffected, 0);
}

// ---------- reading ----------

export type HoldingRow = {
  id: string;
  kind: HoldingKind;
  institution: string;
  name: string;
  currency: string | null;
  subtype: string | null;
  detail_json: string | null;
  last_sync_at: string | null;
  last_error: string | null;
};
export type ValueRow = { holding: string; date: string; amount_minor: number; currency: string };

/** Savings vs everyday money: the bank's account type, else the account's name. Brokers are investments. */
export function holdingGroup(h: Pick<HoldingRow, "kind" | "subtype" | "name">): HoldingGroup {
  if (h.kind === "broker") return "investments";
  if (h.subtype && /^(SVGS|MOMA|ONDP|MGLD)$/i.test(h.subtype)) return "savings";
  return /sav|vault|deposit|pocket|taupym|kaupim|indėl/i.test(h.name) ? "savings" : "cash";
}

/** Each day from `first` to `today`, the latest value of `list` on or before it (null before the first). Pure. */
export function carryForward<T extends { date: string }>(list: readonly T[], first: string, today: string): (T | null)[] {
  const out: (T | null)[] = [];
  let i = -1;
  for (let t = Date.parse(`${first}T00:00:00Z`); isoDay(t) <= today; t += DAY) {
    const date = isoDay(t);
    while (i + 1 < list.length && list[i + 1].date <= date) i++;
    out.push(i < 0 ? null : list[i]);
  }
  return out;
}

const GROUPS: HoldingGroup[] = ["cash", "savings", "investments"];

/**
 * Turns stored holdings and their daily values into the page's numbers. Each day counts every
 * holding at its latest value on or before that day, converted at that day's rate. Pure.
 */
export function buildNetWorth(input: {
  holdings: HoldingRow[];
  values: ValueRow[];
  rates: RateTable;
  base: string;
  today: string;
  now?: number;
}): Pick<NetWorthPayload, "total" | "byKind" | "byGroup" | "history" | "holdings" | "unconverted"> {
  const { rates, base, today } = input;
  const now = input.now ?? Date.now();
  const byHolding = new Map<string, ValueRow[]>();
  for (const v of [...input.values].sort((a, b) => a.date.localeCompare(b.date))) {
    const list = byHolding.get(v.holding) ?? [];
    list.push({ ...v, amount_minor: Number(v.amount_minor) });
    byHolding.set(v.holding, list);
  }
  const unconverted = new Set<string>();
  const toBase = (amount: number, currency: string, date: string) => {
    const r = convert(rates, amount, currency, base, date);
    if (r === null) unconverted.add(currency);
    return r;
  };

  const holdings: Holding[] = input.holdings.map((h) => {
    const latest = byHolding.get(h.id)?.at(-1);
    const value = latest ? latest.amount_minor / 100 : null;
    const currency = latest?.currency ?? h.currency;
    const asOf = h.last_sync_at ?? null;
    return {
      id: h.id,
      kind: h.kind,
      group: holdingGroup(h),
      institution: h.institution,
      name: h.name,
      value,
      currency,
      baseValue: value !== null && currency ? toBase(value, currency, today) : null,
      asOf,
      stale: value !== null && (!asOf || now - Date.parse(asOf) > STALE_AFTER),
      error: h.last_error,
      broker: h.kind === "broker" && h.detail_json ? (JSON.parse(h.detail_json) as BrokerDetail) : null,
    };
  });

  // Daily history from the first recorded value: carry each holding's last value forward.
  const first = [...byHolding.values()].map((l) => l[0].date).sort()[0];
  const history: NetWorthPoint[] = [];
  if (first) {
    const kinds = new Map(input.holdings.map((h) => [h.id, h.kind]));
    const series = [...byHolding.entries()]
      .filter(([id]) => kinds.has(id))
      .map(([id, list]) => [id, carryForward(list, first, today)] as const);
    const days = series[0]?.[1].length ?? 0;
    for (let d = 0; d < days; d++) {
      const date = isoDay(Date.parse(`${first}T00:00:00Z`) + d * DAY);
      const point: NetWorthPoint = { date, bank: 0, broker: 0, total: 0 };
      for (const [id, values] of series) {
        const v = values[d];
        if (!v) continue;
        const inBase = toBase(v.amount_minor / 100, v.currency, date);
        if (inBase !== null) point[kinds.get(id) as HoldingKind] += inBase;
      }
      point.bank = round2(point.bank);
      point.broker = round2(point.broker);
      point.total = round2(point.bank + point.broker);
      history.push(point);
    }
  }

  const byKind: Record<HoldingKind, number> = { bank: 0, broker: 0 };
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g, 0])) as Record<HoldingGroup, number>;
  for (const h of holdings) {
    if (h.baseValue === null) continue;
    byKind[h.kind] += h.baseValue;
    byGroup[h.group] += h.baseValue;
  }
  for (const k of Object.keys(byKind) as HoldingKind[]) byKind[k] = round2(byKind[k]);
  for (const g of GROUPS) byGroup[g] = round2(byGroup[g]);
  return { total: round2(byKind.bank + byKind.broker), byKind, byGroup, history, holdings, unconverted: [...unconverted].sort() };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const KIND_ORDER: Record<HoldingKind, number> = { bank: 0, broker: 1 };

/**
 * The holdings that count (linked, switched-on bank accounts; Trading 212 while its key is set)
 * and their values, with exchange rates ready.
 */
export async function loadHoldings() {
  const db = await getDb();
  const today = isoDay(Date.now());
  const [rows, values, accounts, sessions] = await Promise.all([
    all<HoldingRow>(db, "SELECT id, kind, institution, name, currency, subtype, detail_json, last_sync_at, last_error FROM holdings"),
    all<ValueRow>(db, "SELECT holding, date, amount_minor, currency FROM holding_values ORDER BY date"),
    all<{ account_key: string; included: number }>(db, "SELECT account_key, included FROM bank_accounts"),
    one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM bank_sessions"),
  ]);
  // A disconnected bank keeps its history, which comes back when it's reconnected.
  const included = new Set(accounts.filter((a) => Number(a.included)).map((a) => bankHoldingId(a.account_key)));
  const holdings = rows
    .filter((h) => (h.kind === "bank" ? included.has(h.id) : h.id !== T212_HOLDING_ID || trading212Configured()))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.institution.localeCompare(b.institution) || a.name.localeCompare(b.name));
  const ids = new Set(holdings.map((h) => h.id));
  const shown = values.filter((v) => ids.has(v.holding));
  const base = config.baseCurrency;
  await refreshRates(db, new Set(shown.map((v) => v.currency)), base, today);
  return { db, today, base, holdings, values: shown, rates: await loadRates(db), bankConnected: Number(sessions?.n ?? 0) > 0 };
}

export async function getNetWorth(): Promise<NetWorthPayload> {
  const { today, base, holdings, values, rates, bankConnected } = await loadHoldings();
  return {
    baseCurrency: base,
    today,
    ...buildNetWorth({ holdings, values, rates, base, today }),
    sources: { bankConfigured: bankConfigured(), bankConnected, trading212Configured: trading212Configured() },
  };
}

/** Daily value of one holding in its own currency, from its first recorded value to today. Pure. */
export function holdingHistory(values: readonly ValueRow[], today: string): { date: string; value: number }[] {
  const list = [...values].sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length) return [];
  return carryForward(list, list[0].date, today).map((v, i) => ({
    date: isoDay(Date.parse(`${list[0].date}T00:00:00Z`) + i * DAY),
    value: v ? Number(v.amount_minor) / 100 : 0,
  }));
}

/**
 * Value against money paid in, day by day, from the first deposit (or first recorded value) to
 * today. The deposits line covers the whole history; the value line only starts when tracking did.
 * Pure.
 */
export function investmentHistory(
  values: readonly ValueRow[],
  flows: readonly { date: string; amount_minor: number }[],
  today: string,
): InvestmentsPayload["history"] {
  const v = [...values].sort((a, b) => a.date.localeCompare(b.date));
  const f = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const first = [v[0]?.date, f[0]?.date].filter(Boolean).sort()[0];
  if (!first) return [];
  let running = 0;
  const cumulative = f.map((x) => {
    running += Number(x.amount_minor);
    return { date: x.date, total: running };
  });
  const valueDays = carryForward(v, first, today);
  const depositDays = carryForward(cumulative, first, today);
  return valueDays.map((val, i) => ({
    date: isoDay(Date.parse(`${first}T00:00:00Z`) + i * DAY),
    value: val ? Number(val.amount_minor) / 100 : null,
    deposits: f.length ? (depositDays[i]?.total ?? 0) / 100 : null,
  }));
}

export async function getInvestments(): Promise<InvestmentsPayload> {
  const { db, today, base, holdings, values, rates } = await loadHoldings();
  const built = buildNetWorth({ holdings, values, rates, base, today });
  const holding = built.holdings.find((h) => h.id === T212_HOLDING_ID) ?? null;
  const [flows, state] = await Promise.all([
    all<{ date: string; amount_minor: number; currency: string }>(
      db,
      "SELECT date, amount_minor, currency FROM broker_cash_flows WHERE holding = ? ORDER BY date",
      [T212_HOLDING_ID],
    ),
    getState<CashFlowState>(db, CASH_FLOW_STATE),
  ]);
  // Deposits count only once the whole history is in: a partial total would show the missing early
  // deposits as profit. Ones in another currency than the account's can't be added up honestly.
  const complete = Boolean(state?.complete);
  const own = !complete ? [] : holding?.currency ? flows.filter((f) => f.currency === holding.currency) : flows;
  const history = investmentHistory(
    values.filter((v) => v.holding === T212_HOLDING_ID),
    own,
    today,
  );
  const netDeposits = own.length ? own.reduce((s, f) => s + Number(f.amount_minor), 0) / 100 : null;
  const returnAmount = holding?.value != null && netDeposits !== null ? round2(holding.value - netDeposits) : null;
  // A rate needs something paid in to be a rate of (after withdrawing more than you put in, it isn't).
  return {
    baseCurrency: base,
    today,
    configured: trading212Configured(),
    holding,
    history,
    netDeposits,
    returnAmount,
    returnRate: returnAmount !== null && netDeposits !== null && netDeposits > 0 ? returnAmount / netDeposits : null,
    deposits: { synced: Boolean(state && !state.error), complete, error: state?.error ?? null },
  };
}
