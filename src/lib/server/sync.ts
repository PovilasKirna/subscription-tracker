import { type FetchWindow, fetchWindow, reconcileBankAccounts } from "./bankAccounts";
import { bankConfigured, config } from "./config";
import { all, getDb, type InsertStats, insertTransactions, logImport, one, run, type TxRow } from "./db";
import { accountKey, BankApiError, type EbAccount, fetchTransactions, getSessionStatus, type PsuContext } from "./enableBanking";
import { captureBankBalance } from "./netWorth";

type SessionRow = {
  session_id: string;
  aspsp_name: string;
  accounts_json: string;
  last_sync_at: string | null;
  valid_until: string | null;
  required_psu_headers: string | null;
  status: string | null;
  next_retry_at: string | null;
};

export type SyncOptions = {
  /** Present when the user triggered the sync: lifts the bank's background-fetch limit. */
  psu?: PsuContext;
  /** Limit the run to one session (e.g. right after connecting). */
  sessionId?: string;
  /** Scheduled run: respects rate-limit back-off. */
  background?: boolean;
  /** Background only: skip sessions synced more recently than this. */
  minIntervalHours?: number;
};
export type SyncResult = InsertStats & { errors: string[] };

const DAY = 86_400_000;
const RATE_LIMIT_BACKOFF = 6 * 3_600_000; // Enable Banking's advice after ASPSP_RATE_LIMIT_EXCEEDED
const isoDate = (t: number) => new Date(t).toISOString().slice(0, 10);

let running: Promise<SyncResult> | null = null;

/** Scheduled syncs are spaced at least this far apart, so hourly ticks stay within the bank's background quota. */
export const minSyncIntervalHours = () => Math.max(6, config.syncIntervalHours);

/** Sync markers older than this are from runs that crashed mid-way and are ignored. */
export const syncCutoff = () => new Date(Date.now() - 10 * 60_000).toISOString();

/** Read from the DB, not memory: route handlers and page renders may run in different workers. */
export async function isSyncing(): Promise<boolean> {
  return Boolean(await one(await getDb(), "SELECT 1 AS x FROM bank_sessions WHERE sync_started_at > ? LIMIT 1", [syncCutoff()]));
}

/** Pull new transactions for linked bank sessions. Concurrent calls share one run. */
export function syncAll(opts: SyncOptions = {}): Promise<SyncResult> {
  running ??= doSync(opts).finally(() => {
    running = null;
  });
  return running;
}

/** Without a fresh consent, banks only guarantee the last 90 days (PSD2). */
const SAFE_WINDOW_DAYS = 89;

/**
 * A fresh run that starts once any current one has finished, for changes a running sync may have
 * already passed (e.g. an account switched back on mid-run).
 */
export async function syncAfterCurrent(opts: SyncOptions): Promise<SyncResult> {
  while (running) await running.catch(() => undefined);
  return syncAll(opts);
}

async function fetchAccount(account: EbAccount, window: FetchWindow, s: SessionRow, opts: SyncOptions): Promise<TxRow[]> {
  const requiredPsuHeaders = s.required_psu_headers ? (JSON.parse(s.required_psu_headers) as string[]) : [];
  const base = { psu: opts.psu, requiredPsuHeaders };
  const safeFrom = isoDate(Date.now() - SAFE_WINDOW_DAYS * DAY);
  // A full fetch asks for the earliest transaction the bank can serve.
  const wanted =
    window.kind === "full"
      ? { ...base, dateFrom: isoDate(Date.now() - 5 * 365 * DAY), strategy: "longest" as const }
      : { ...base, dateFrom: window.dateFrom };
  try {
    return await fetchTransactions(account, wanted);
  } catch (e) {
    // Some banks reject long windows (a full history, or an account switched back on after months);
    // fall back to the PSD2 90-day minimum.
    if (!(e instanceof BankApiError) || e.rateLimited || e.consentLost || wanted.dateFrom >= safeFrom) throw e;
    return fetchTransactions(account, { ...base, dateFrom: safeFrom });
  }
}

async function doSync(opts: SyncOptions): Promise<SyncResult> {
  const result: SyncResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  if (!bankConfigured()) return result;
  const db = await getDb();
  const rows = await all<SessionRow>(db, "SELECT * FROM bank_sessions");
  const accounts = new Map((await reconcileBankAccounts(db)).map((a) => [a.account_key, a]));
  const sessions = opts.sessionId ? rows.filter((s) => s.session_id === opts.sessionId) : rows;
  const setError = (id: string, message: string, extra = "") =>
    run(db, `UPDATE bank_sessions SET last_error = ?${extra} WHERE session_id = ?`, [message, id]);

  let attempted = 0;
  try {
    for (const s of sessions) {
      if (s.status === "needs_reconnect") continue;
      if (s.valid_until && Date.parse(s.valid_until) < Date.now()) {
        await setError(s.session_id, "Consent expired — reconnect Revolut to keep syncing.", ", status = 'needs_reconnect'");
        result.errors.push(`${s.aspsp_name}: consent expired`);
        continue;
      }
      if (opts.background && !opts.psu) {
        if (s.next_retry_at && Date.parse(s.next_retry_at) > Date.now()) continue;
        const due = (opts.minIntervalHours ?? 0) * 3_600_000 - 5 * 60_000; // small slack for timer drift
        if (s.last_sync_at && Date.now() - Date.parse(s.last_sync_at) < due) continue;
      }

      attempted++;
      await run(db, "UPDATE bank_sessions SET sync_started_at = ? WHERE session_id = ?", [new Date().toISOString(), s.session_id]);
      try {
        for (const account of JSON.parse(s.accounts_json) as EbAccount[]) {
          const key = accountKey(account);
          const row = accounts.get(key);
          if (row && !row.included) continue; // switched off: not fetched, saving the bank's daily quota
          const startedAt = new Date().toISOString();
          const window = fetchWindow({ syncedThrough: row?.synced_through ?? null }, { lastSyncAt: s.last_sync_at });
          const st = await insertTransactions(db, await fetchAccount(account, window, s, opts));
          // Only this column changes, so the detection snapshot isn't invalidated by progress alone.
          await run(db, "UPDATE bank_accounts SET synced_through = ? WHERE account_key = ?", [startedAt, key]);
          await captureBankBalance(db, account, s, { psu: opts.psu }); // for net worth; never throws
          result.inserted += st.inserted;
          result.updated += st.updated;
          result.skipped += st.skipped;
        }
        await run(
          db,
          "UPDATE bank_sessions SET last_sync_at = ?, last_error = NULL, next_retry_at = NULL, status = 'active' WHERE session_id = ?",
          [new Date().toISOString(), s.session_id],
        );
      } catch (e) {
        const err = e instanceof BankApiError ? e : null;
        if (err?.rateLimited) {
          const retry = new Date(Date.now() + RATE_LIMIT_BACKOFF);
          await setError(
            s.session_id,
            `Revolut's daily limit for background syncs was reached. Next automatic try after ${retry.toISOString().slice(11, 16)} UTC — "Sync now" still works.`,
            `, next_retry_at = '${retry.toISOString()}'`,
          );
        } else if (err?.consentLost || (err && (await sessionGone(s.session_id)))) {
          await setError(
            s.session_id,
            "Access was revoked or has expired — reconnect Revolut to keep syncing.",
            ", status = 'needs_reconnect'",
          );
        } else {
          await setError(s.session_id, (e as Error).message);
        }
        result.errors.push(`${s.aspsp_name}: ${(e as Error).message}`);
      }
    }
    if (attempted) await logImport(db, "bank", result, result.errors.length ? result.errors.join("; ").slice(0, 300) : undefined);
  } finally {
    // Clear the "syncing" markers only once the whole run is logged — never between sessions —
    // so a status poll can't see the run as finished before its import entry exists. Covers every
    // session in scope, including one the bank callback marked but this run skipped.
    if (sessions.length) {
      const ids = sessions.map((s) => s.session_id);
      await run(db, `UPDATE bank_sessions SET sync_started_at = NULL WHERE session_id IN (${ids.map(() => "?").join(", ")})`, ids);
    }
  }
  return result;
}

/** Double-check with Enable Banking whether the session is still authorized. */
async function sessionGone(sessionId: string): Promise<boolean> {
  try {
    const status = await getSessionStatus(sessionId);
    return status !== null && status !== "AUTHORIZED";
  } catch (e) {
    return e instanceof BankApiError && (e.status === 404 || e.consentLost);
  }
}
