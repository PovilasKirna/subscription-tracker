import type { InStatement } from "@libsql/client";
import { all, allTransactions, type Db, type TxRow } from "./db";
import { accountKey, type EbAccount } from "./enableBanking";

// Per-account bank state: the "Included" switch and how far each account has been fetched.
// Rows are keyed by the stable account key, so they survive reconnecting the bank.

export type BankAccountRow = {
  account_key: string;
  session_id: string;
  name: string | null;
  iban: string | null;
  currency: string | null;
  included: number; // 1 | 0
  synced_through: string | null;
};

type SessionAccounts = { session_id: string; accounts_json: string };
type AccountInfo = Pick<BankAccountRow, "account_key" | "session_id" | "name" | "iban" | "currency">;

/**
 * What to write so `bank_accounts` matches the sessions' account lists: rows to insert or refresh
 * (an account moves to the newest session that lists it) and rows of accounts no session lists any
 * more (their bank was disconnected), whose transactions must become visible again. Pure.
 */
export function planAccountRows(sessions: SessionAccounts[], existing: BankAccountRow[]): { upsert: AccountInfo[]; remove: string[] } {
  const wanted = new Map<string, AccountInfo>();
  for (const s of sessions) {
    for (const a of JSON.parse(s.accounts_json) as EbAccount[]) {
      const key = accountKey(a);
      if (wanted.has(key)) continue; // sessions come newest first
      wanted.set(key, {
        account_key: key,
        session_id: s.session_id,
        name: a.name ?? null,
        iban: a.account_id?.iban ?? null,
        currency: a.currency ?? null,
      });
    }
  }
  const current = new Map(existing.map((r) => [r.account_key, r]));
  const upsert = [...wanted.values()].filter((w) => {
    const r = current.get(w.account_key);
    return !r || r.session_id !== w.session_id || r.name !== w.name || r.iban !== w.iban || r.currency !== w.currency;
  });
  const remove = existing.filter((r) => !wanted.has(r.account_key)).map((r) => r.account_key);
  return { upsert, remove };
}

/**
 * Brings `bank_accounts` in line with the linked sessions (after connecting, reconnecting or
 * disconnecting, and lazily for sessions linked before the table existed) and returns its rows.
 * Usually a single read: nothing is written when the rows are already up to date.
 */
export async function reconcileBankAccounts(db: Db): Promise<BankAccountRow[]> {
  const [sessions, existing] = await Promise.all([
    all<SessionAccounts>(db, "SELECT session_id, accounts_json FROM bank_sessions ORDER BY created_at DESC, session_id"),
    all<BankAccountRow>(db, "SELECT account_key, session_id, name, iban, currency, included, synced_through FROM bank_accounts"),
  ]);
  const { upsert, remove } = planAccountRows(sessions, existing);
  if (!upsert.length && !remove.length) return existing;
  const writes: InStatement[] = [
    // `included` and `synced_through` are left alone so the preference and progress survive reconnects.
    ...upsert.map((a) => ({
      sql: `INSERT INTO bank_accounts (account_key, session_id, name, iban, currency) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(account_key) DO UPDATE SET
              session_id = excluded.session_id, name = excluded.name, iban = excluded.iban, currency = excluded.currency`,
      args: [a.account_key, a.session_id, a.name, a.iban, a.currency],
    })),
    ...remove.map((key) => ({ sql: "DELETE FROM bank_accounts WHERE account_key = ?", args: [key] })),
  ];
  await db.batch(writes, "write");
  return all<BankAccountRow>(db, "SELECT account_key, session_id, name, iban, currency, included, synced_through FROM bank_accounts");
}

/** Keys of the bank accounts the user switched off. */
export async function hiddenAccountKeys(db: Db): Promise<Set<string>> {
  const rows = await all<{ account_key: string }>(db, "SELECT account_key FROM bank_accounts WHERE included = 0");
  return new Set(rows.map((r) => r.account_key));
}

/**
 * Drops transactions of switched-off bank accounts. CSV rows aren't linked to bank accounts, so
 * they always stay. Nothing is deleted: exports read the table directly.
 */
export function withoutHiddenAccounts<T extends Pick<TxRow, "source" | "account">>(txs: T[], hidden: ReadonlySet<string>): T[] {
  if (!hidden.size) return txs;
  return txs.filter((t) => !(t.source === "bank" && t.account !== null && hidden.has(t.account)));
}

/**
 * Every transaction the app shows — the one place excluded accounts are filtered out, so detection,
 * subscriptions, history and the transactions list all agree.
 */
export async function visibleTransactions(db: Db): Promise<TxRow[]> {
  const [txs, hidden] = await Promise.all([allTransactions(db), hiddenAccountKeys(db)]);
  return withoutHiddenAccounts(txs, hidden);
}

const DAY = 86_400_000;
/** Incremental fetches overlap a week so late-booked transactions are picked up; ids de-duplicate. */
export const SYNC_OVERLAP_DAYS = 7;

export type FetchWindow = { kind: "full" } | { kind: "incremental"; dateFrom: string };

/**
 * Which transactions to ask the bank for, for one account. A session that has never synced gets
 * the full history (banks usually expose it only shortly after consent — this is also how a
 * reconnect fills gaps). After that each account continues from its own last successful fetch, so
 * an account switched back on backfills the time it was off; accounts tracked before per-account
 * progress existed fall back to the session's last sync.
 */
export function fetchWindow(account: { syncedThrough: string | null }, session: { lastSyncAt: string | null }): FetchWindow {
  if (!session.lastSyncAt) return { kind: "full" };
  const since = account.syncedThrough ?? session.lastSyncAt;
  return { kind: "incremental", dateFrom: new Date(Date.parse(since) - SYNC_OVERLAP_DAYS * DAY).toISOString().slice(0, 10) };
}
