import "server-only";
import { cache } from "react";
import type { SubscriptionFilters, TransactionFilters } from "../search-params";
import type {
  AssignOptionsPayload,
  DataStatusPayload,
  HistoryPayload,
  RelatedTransaction,
  Subscription,
  SubscriptionDetailPayload,
  SubscriptionsPayload,
  SubscriptionsTablePayload,
  TransactionItem,
  TransactionsPayload,
} from "../types";
import { bankConfigured, config } from "./config";
import { all, allAssignments, allExclusions, allOverrides, allTransactions, dataVersion, getDb, one, type TxRow } from "./db";
import { buildHistory, type Detection, detectSubscriptions, parseSubKey, sameAmount, websiteResolver } from "./detect";
import { merchantName } from "./merchant";
import { memoByVersion } from "./snapshot";
import { querySubscriptions } from "./subscriptionTable";
import { isSyncing } from "./sync";
import { queryTransactions } from "./transactionTable";

// Data functions shared by server-component prefetching and the /api route handlers,
// so the server-rendered HTML and client refetches always return identical shapes.

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Every transaction plus the detection result. Loading all transactions is the expensive part
 * (a full table read from Turso), so the snapshot is reused until the data version (bumped by DB
 * triggers on any write) or the day changes. A cache hit costs one tiny query, and React's
 * per-request cache dedupes even that when one render calls several queries. Read-only.
 */
export const detection = cache(
  memoByVersion(
    async () => `${await dataVersion(await getDb())}|${today()}`,
    async (version): Promise<{ txs: TxRow[]; det: Detection; excluded: Set<string>; assigned: Map<string, string> }> => {
      const day = version.slice(version.indexOf("|") + 1);
      const db = await getDb();
      const [txs, overrides, excluded, assigned] = await Promise.all([
        allTransactions(db),
        allOverrides(db),
        allExclusions(db),
        allAssignments(db),
      ]);
      return { txs, excluded, assigned, det: detectSubscriptions(txs, overrides, day, config.baseCurrency, excluded, assigned) };
    },
  ),
);

type WebsiteOf = ReturnType<typeof websiteResolver>;

const toItem = (t: TxRow, subscriptionKey: string | null, websiteOf: WebsiteOf): TransactionItem => ({
  id: t.id,
  date: t.date,
  description: t.description,
  merchantKey: t.merchant_key,
  website: websiteOf(t.merchant_key, subscriptionKey),
  amount: t.amount_minor / 100,
  currency: t.currency,
  type: t.type,
  source: t.source,
  subscriptionKey,
});

const newestFirst = (a: TxRow, b: TxRow) => b.date.localeCompare(a.date);
/** Enough to spot a plan change or a stray charge without flooding the list with shopping. */
const MAX_RELATED = 40;

/**
 * Outgoing payments to any of `merchants` (in `currency`) that aren't in `exceptKey`, newest
 * first. `similar` marks the ones priced like one of `amounts` (minor units, negative).
 */
function relatedTransactions(
  txs: TxRow[],
  det: Detection,
  excluded: ReadonlySet<string>,
  match: { merchants: ReadonlySet<string>; currency: string; amounts: number[]; exceptKey?: string; exceptId?: string },
): RelatedTransaction[] {
  const names = new Map(det.subscriptions.map((s) => [s.key, s.name]));
  const websiteOf = websiteResolver(det);
  return txs
    .filter(
      (t) =>
        t.amount_minor < 0 &&
        t.currency === match.currency &&
        match.merchants.has(t.merchant_key) &&
        t.id !== match.exceptId &&
        !excluded.has(t.id) &&
        (match.exceptKey === undefined || det.txToSub.get(t.id) !== match.exceptKey),
    )
    .sort(newestFirst)
    .slice(0, MAX_RELATED)
    .map((t) => {
      const subscriptionKey = det.txToSub.get(t.id) ?? null;
      return {
        ...toItem(t, subscriptionKey, websiteOf),
        similar: match.amounts.some((a) => sameAmount(t.amount_minor, a)),
        subscriptionName: subscriptionKey ? (names.get(subscriptionKey) ?? null) : null,
      };
    });
}

/** Everything the subscription drawer shows: the subscription, its charges, excluded and related ones. */
export async function getSubscriptionDetail(key: string): Promise<SubscriptionDetailPayload> {
  const { txs, det, excluded, assigned } = await detection();
  const active = det.subscriptions.find((s) => s.key === key);
  const ignored = det.ignored.find((s) => s.key === key);
  const subscription = active ?? ignored ?? null;
  const { merchantKey, currency } = parseSubKey(key);
  const counted = txs.filter((t) => det.txToSub.get(t.id) === key);
  const websiteOf = websiteResolver(det);
  return {
    baseCurrency: config.baseCurrency,
    today: today(),
    subscription,
    ignored: Boolean(ignored),
    transactions: txs
      .filter(
        (t) =>
          det.txToSub.get(t.id) === key ||
          (ignored && t.merchant_key === merchantKey && t.currency === currency && !excluded.has(t.id) && t.amount_minor < 0),
      )
      .sort(newestFirst)
      .map((t) => toItem(t, active ? key : null, websiteOf)),
    excluded: txs
      .filter((t) => excluded.has(t.id) && ((t.merchant_key === merchantKey && t.currency === currency) || assigned.get(t.id) === key))
      .sort(newestFirst)
      .map((t) => toItem(t, null, websiteOf)),
    related: active
      ? relatedTransactions(txs, det, excluded, {
          merchants: new Set([merchantKey, ...counted.map((t) => t.merchant_key)]),
          currency,
          amounts: counted.map((t) => t.amount_minor),
          exceptKey: key,
        })
      : [],
  };
}

/** Name of a subscription started from this payment (what detection would call the merchant). */
const nameFor = (t: TxRow) => merchantName(t.merchant_key, t.description);

/** What the "Add to subscription" dialog offers for one payment. Null if it doesn't exist. */
export async function getAssignOptions(txId: string): Promise<AssignOptionsPayload | null> {
  const { txs, det, excluded } = await detection();
  const tx = txs.find((t) => t.id === txId);
  if (!tx) return null;
  const currentKey = det.txToSub.get(tx.id);
  const toTarget = (s: Subscription) => ({
    key: s.key,
    name: s.name,
    amount: s.amount,
    currency: s.currency,
    cadence: s.cadence,
    status: s.status,
    sameMerchant: s.merchantKey === tx.merchant_key,
  });
  return {
    transaction: toItem(tx, currentKey ?? null, websiteResolver(det)),
    newName: nameFor(tx),
    targets: det.subscriptions
      .filter((s) => s.currency === tx.currency && s.key !== currentKey)
      .map(toTarget)
      .sort((a, b) => Number(b.sameMerchant) - Number(a.sameMerchant) || a.name.localeCompare(b.name, "en", { sensitivity: "base" })),
    related: relatedTransactions(txs, det, excluded, {
      merchants: new Set([tx.merchant_key]),
      currency: tx.currency,
      amounts: [tx.amount_minor],
      exceptId: tx.id,
    }),
  };
}

export async function getSubscriptions(): Promise<SubscriptionsPayload> {
  const { det } = await detection();
  return { baseCurrency: config.baseCurrency, today: today(), subscriptions: det.subscriptions, ignored: det.ignored };
}

/** Filtered, sorted, paginated page for the subscriptions data table (see subscriptionTable.ts). */
export async function getSubscriptionsTable(filters: SubscriptionFilters): Promise<SubscriptionsTablePayload> {
  const { det } = await detection();
  return querySubscriptions({ today: today(), subscriptions: det.subscriptions, ignored: det.ignored }, filters);
}

export async function getHistory(months = 12): Promise<HistoryPayload> {
  const { txs, det } = await detection();
  return buildHistory(txs, det, config.baseCurrency, today(), Math.min(Math.max(months, 3), 36));
}

/** Filtered, sorted, paginated page for the transactions data table (see transactionTable.ts). */
export async function getTransactions(filters: TransactionFilters): Promise<TransactionsPayload> {
  const { txs, det } = await detection();
  return queryTransactions(txs, det.txToSub, filters, websiteResolver(det));
}

export async function getDataStatus(): Promise<DataStatusPayload> {
  const db = await getDb();
  const stats = (await one<{ n: number; first: string | null; last: string | null }>(
    db,
    "SELECT COUNT(*) AS n, MIN(date) AS first, MAX(date) AS last FROM transactions",
  )) ?? { n: 0, first: null, last: null };
  const sessions = await all<{
    session_id: string;
    aspsp_name: string;
    aspsp_country: string;
    valid_until: string | null;
    accounts_json: string;
    last_sync_at: string | null;
    last_error: string | null;
    status: string | null;
    next_retry_at: string | null;
  }>(db, "SELECT * FROM bank_sessions ORDER BY created_at DESC");
  const imports = await all<DataStatusPayload["imports"][number]>(
    db,
    "SELECT id, at, source, inserted, updated, skipped, message FROM import_log ORDER BY id DESC LIMIT 10",
  );
  return {
    transactionCount: Number(stats.n),
    firstDate: stats.first,
    lastDate: stats.last,
    bankConfigured: bankConfigured(),
    syncIntervalHours: config.syncIntervalHours,
    syncing: await isSyncing(),
    sessions: sessions.map((s) => ({
      sessionId: s.session_id,
      aspsp: s.aspsp_name,
      country: s.aspsp_country,
      validUntil: s.valid_until,
      lastSyncAt: s.last_sync_at,
      lastError: s.last_error,
      status: s.status === "needs_reconnect" ? "needs_reconnect" : "active",
      nextRetryAt: s.next_retry_at,
      accounts: (JSON.parse(s.accounts_json) as { uid: string; name?: string; currency?: string; account_id?: { iban?: string } }[]).map(
        (a) => ({
          uid: a.uid,
          name: a.name ?? null,
          iban: a.account_id?.iban ? `•••• ${a.account_id.iban.slice(-4)}` : null,
          currency: a.currency ?? null,
        }),
      ),
    })),
    imports: imports.map((i) => ({ ...i })),
  };
}
