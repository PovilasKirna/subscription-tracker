import type { InStatement } from "@libsql/client";
import { NOTIFICATION_TYPES, type NotificationType, type Settings } from "../../settings";
import type { NotificationItem, NotificationsPayload, ReminderCharge } from "../../types";
import { config } from "../config";
import { all, type Db, getDb, run } from "../db";
import { detection } from "../queries";
import { chargeTotalMinor } from "../reimburse";
import { getSettings, getState, setState, swapState } from "../settings";
import { configuredChannels, type NotificationChannel, type OutgoingNotification } from "./channels";
import {
  buildDigest,
  type DigestEvent,
  digestDue,
  isResolved,
  type NotificationData,
  type NotificationSnapshot,
  type PendingCharge,
  planNotifications,
  seenSubscriptions,
} from "./plan";

// runNotifications(): the one job every trigger calls (the hourly tick, the self-hosted timer, a
// finished sync or import). Plan → store new ones (deduped) → resolve → deliver through the
// configured channels → digest → retention. Safe to run as often as you like.

export const RETENTION_DAYS = 90;
/** Older notifications aren't pushed or emailed any more (e.g. a channel set up later doesn't replay the backlog). */
const DELIVERY_WINDOW_MS = 24 * 3_600_000;
const DAY = 86_400_000;

type Row = {
  id: number;
  dedupe_key: string;
  type: NotificationType;
  title: string;
  body: string;
  data_json: string;
  created_at: string;
  read_at: string | null;
  resolved_at: string | null;
  pushed_at: string | null;
  emailed_at: string | null;
};

const COLUMNS = "id, dedupe_key, type, title, body, data_json, created_at, read_at, resolved_at, pushed_at, emailed_at";
/** Types whose subject can be dealt with (see isResolved); the others are only ever read. */
const RESOLVABLE: NotificationType[] = ["reimbursement_reminder", "bank_attention", "sync_error", "yearly_renewal", "subscription_overdue"];

function parseData(json: string): NotificationData {
  try {
    const data = JSON.parse(json) as Partial<NotificationData>;
    return { ...data, url: data.url ?? null };
  } catch {
    return { url: null };
  }
}

type LastDigest = { key: string; at: string };

/** Everything the planner looks at, read from the database. */
export async function loadSnapshot(db: Db): Promise<NotificationSnapshot> {
  const [{ det, txs, reimbursedTx, reimbursement }, sessions, known, lastRunAt] = await Promise.all([
    detection(),
    all<{
      session_id: string;
      aspsp_name: string;
      status: string | null;
      valid_until: string | null;
      last_error: string | null;
      last_sync_at: string | null;
      next_retry_at: string | null;
    }>(db, "SELECT session_id, aspsp_name, status, valid_until, last_error, last_sync_at, next_retry_at FROM bank_sessions"),
    getState<string[]>(db, "state.knownSubscriptions"),
    getState<string>(db, "state.lastRun"),
  ]);
  const subs = new Map(det.subscriptions.map((s) => [s.key, s]));
  const txById = new Map(txs.map((t) => [t.id, t]));
  const pendingCharges: PendingCharge[] = [];
  for (const [txId, r] of reimbursedTx) {
    if (r.status !== "pending" || r.sourceId === null) continue;
    const tx = txById.get(txId);
    const sub = subs.get(det.txToSub.get(txId) ?? "");
    if (!tx || !sub) continue;
    // The whole day charge (e.g. €18 + a €0.50 fee), as the reimbursement API caps it, so "Got €X"
    // never asks for more than can be recorded against this payment.
    const amount = chargeTotalMinor(tx, txs, det.txToSub) / 100;
    pendingCharges.push({
      txId,
      subKey: sub.key,
      name: sub.name,
      date: tx.date,
      amount,
      expected: Math.min(r.amount, amount),
      currency: sub.currency,
      sourceId: r.sourceId,
    });
  }
  return {
    subscriptions: det.subscriptions,
    pendingCharges,
    sources: [...reimbursement.sources.values()].map((s) => ({ id: s.id, name: s.name, mode: s.mode, reminderDay: s.reminder_day })),
    bankSessions: sessions.map((s) => ({
      sessionId: s.session_id,
      aspsp: s.aspsp_name,
      status: s.status === "needs_reconnect" ? "needs_reconnect" : "active",
      validUntil: s.valid_until,
      lastError: s.last_error,
      lastSyncAt: s.last_sync_at,
      nextRetryAt: s.next_retry_at,
    })),
    knownSubscriptions: Array.isArray(known) ? new Set(known) : null,
    lastRunAt: typeof lastRunAt === "string" ? lastRunAt : null,
  };
}

/** Marks open notifications whose subject was dealt with as resolved. Returns how many. */
export async function resolveOpen(db: Db, snapshot: NotificationSnapshot, now: Date): Promise<number> {
  const open = await all<Row>(
    db,
    `SELECT ${COLUMNS} FROM notifications WHERE silent = 0 AND resolved_at IS NULL AND type IN (${RESOLVABLE.map(() => "?").join(", ")})`,
    RESOLVABLE,
  );
  const done = open.filter((r) => isResolved({ type: r.type, data: parseData(r.data_json) }, snapshot));
  if (!done.length) return 0;
  const at = now.toISOString();
  await run(db, `UPDATE notifications SET resolved_at = ? WHERE resolved_at IS NULL AND id IN (${done.map(() => "?").join(", ")})`, [
    at,
    ...done.map((r) => r.id),
  ]);
  return done.length;
}

/**
 * Claims a delivery (so overlapping runs never send twice), sends it, and gives the claim back if
 * sending failed so a later run retries.
 */
async function deliver(db: Db, row: Row, column: "pushed_at" | "emailed_at", send: () => Promise<void>, now: Date): Promise<boolean> {
  const claim = await db.execute({
    sql: `UPDATE notifications SET ${column} = ? WHERE id = ? AND ${column} IS NULL`,
    args: [now.toISOString(), row.id],
  });
  if (!claim.rowsAffected) return false;
  try {
    await send();
    return true;
  } catch (e) {
    console.error(`[notifications] ${column === "pushed_at" ? "push" : "email"} of #${row.id} failed:`, e);
    await run(db, `UPDATE notifications SET ${column} = NULL WHERE id = ?`, [row.id]);
    return false;
  }
}

export type RunResult = { created: number; resolved: number; pushed: number; emailed: number; digest: string | null; deleted: number };

export type RunInput = {
  snapshot: NotificationSnapshot;
  settings: Settings;
  now: Date;
  channels: NotificationChannel[];
  baseCurrency: string;
};

/** The whole pipeline against a given snapshot (what runNotifications does after loading it). */
export async function processNotifications(db: Db, { snapshot, settings, now, channels, baseCurrency }: RunInput): Promise<RunResult> {
  const result: RunResult = { created: 0, resolved: 0, pushed: 0, emailed: 0, digest: null, deleted: 0 };
  const at = now.toISOString();

  // 1. Plan and store; the unique dedupe key turns repeats into no-ops.
  const candidates = planNotifications(snapshot, settings, now);
  if (candidates.length) {
    const inserts: InStatement[] = candidates.map((c) => ({
      sql: `INSERT INTO notifications (dedupe_key, type, title, body, data_json, silent, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(dedupe_key) DO NOTHING`,
      args: [c.dedupeKey, c.type, c.title, c.body, JSON.stringify(c.data), c.silent ? 1 : 0, at],
    }));
    const results = await db.batch(inserts, "write");
    result.created = results.reduce((n, r, i) => n + (candidates[i].silent ? 0 : r.rowsAffected), 0);
  }

  // Remember which subscriptions exist, so only later ones count as new. The first run that finds
  // any is the baseline; before that (an empty database) there is nothing to compare against.
  const seen = seenSubscriptions(snapshot);
  const known = snapshot.knownSubscriptions;
  if (known ? seen.some((k) => !known.has(k)) : seen.length > 0) {
    await setState(db, "state.knownSubscriptions", [...new Set([...(known ?? []), ...seen])].sort());
  }

  // 2. Resolve what has been dealt with.
  result.resolved = await resolveOpen(db, snapshot, now);

  // 3. Deliver new, unread, unresolved notifications through each ready channel the user wants.
  const ready = channels.filter((c) => c.ready(settings));
  const push = ready.filter((c) => c.kind === "push");
  const email = ready.filter((c) => c.kind === "email");
  if (ready.length) {
    const due = await all<Row>(
      db,
      `SELECT ${COLUMNS} FROM notifications
        WHERE silent = 0 AND read_at IS NULL AND resolved_at IS NULL AND created_at >= ? AND (pushed_at IS NULL OR emailed_at IS NULL)
        ORDER BY id`,
      [new Date(now.getTime() - DELIVERY_WINDOW_MS).toISOString()],
    );
    for (const row of due) {
      const pref = settings.notifications[row.type];
      if (!pref) continue;
      const out: OutgoingNotification = {
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        url: parseData(row.data_json).url,
        tag: row.dedupe_key,
        createdAt: row.created_at,
      };
      if (pref.push && !row.pushed_at && push.length) {
        const ok = await deliver(
          db,
          row,
          "pushed_at",
          () => Promise.all(push.map((c) => c.send(out, settings))).then(() => undefined),
          now,
        );
        if (ok) result.pushed++;
      }
      if (pref.email === "immediate" && !row.emailed_at && email.length) {
        const ok = await deliver(
          db,
          row,
          "emailed_at",
          () => Promise.all(email.map((c) => c.send(out, settings))).then(() => undefined),
          now,
        );
        if (ok) result.emailed++;
      }
    }
  }

  // 4. The digest, handed to the email channel (nothing to send it with otherwise).
  const digester = email.find((c) => c.sendDigest);
  const last = await getState<LastDigest>(db, "state.lastDigest");
  const slot = digester ? digestDue(settings, now, last?.key ?? null, snapshot.lastRunAt) : null;
  if (digester?.sendDigest && slot) {
    const since = last?.at ?? new Date(now.getTime() - (slot.frequency === "weekly" ? 7 : 31) * DAY).toISOString();
    const digestTypes = NOTIFICATION_TYPES.filter((t) => settings.notifications[t].email === "digest");
    const rows = digestTypes.length
      ? await all<Row>(
          db,
          `SELECT ${COLUMNS} FROM notifications WHERE silent = 0 AND created_at > ? AND created_at <= ? AND type IN (${digestTypes.map(() => "?").join(", ")})`,
          [since, at, ...digestTypes],
        )
      : [];
    const events: DigestEvent[] = rows.map((r) => ({ title: r.title, body: r.body, url: parseData(r.data_json).url, at: r.created_at }));
    const mine: LastDigest = { key: slot.key, at };
    if (await swapState(db, "state.lastDigest", last, mine)) {
      try {
        await digester.sendDigest(buildDigest(slot, events, snapshot, settings, baseCurrency, now), settings);
        result.digest = slot.key;
        if (rows.length) {
          await run(db, `UPDATE notifications SET emailed_at = ? WHERE emailed_at IS NULL AND id IN (${rows.map(() => "?").join(", ")})`, [
            at,
            ...rows.map((r) => r.id),
          ]);
        }
      } catch (e) {
        console.error("[notifications] digest failed:", e);
        await swapState(db, "state.lastDigest", mine, last); // give the slot back (null deletes it); the next run retries
      }
    }
  }

  // Lets the next run tell a missed reminder/digest from one this run already looked at.
  await setState(db, "state.lastRun", at);

  // 5. Retention.
  const del = await db.execute({
    sql: "DELETE FROM notifications WHERE created_at < ?",
    args: [new Date(now.getTime() - RETENTION_DAYS * DAY).toISOString()],
  });
  result.deleted = del.rowsAffected;
  return result;
}

let chain: Promise<unknown> = Promise.resolve();

/**
 * Plans, stores, resolves and delivers notifications. Runs one at a time per process (a run after
 * an import waits for any current one, so it always sees the imported data).
 */
export function runNotifications(now?: Date, channels?: NotificationChannel[]): Promise<RunResult> {
  const next = chain.then(async () => {
    const db = await getDb();
    const [snapshot, settings, ready] = await Promise.all([loadSnapshot(db), getSettings(db), channels ?? configuredChannels(db)]);
    return processNotifications(db, { snapshot, settings, now: now ?? new Date(), channels: ready, baseCurrency: config.baseCurrency });
  });
  chain = next.catch(() => undefined);
  return next;
}

/** For `after()`: runs notifications and logs (never throws) when the response has already gone. */
export function runNotificationsQuietly(reason: string): Promise<void> {
  return runNotifications().then(
    (r) => {
      if (r.created) console.log(`[notifications] ${reason}: ${r.created} new`);
    },
    (e) => console.error(`[notifications] ${reason}: failed`, e),
  );
}

// Feed --------------------------------------------------------------------------------------

const FEED_LIMIT = 50;

/** Live status of the charges a reimbursement reminder lists. */
function reminderCharges(
  data: NotificationData,
  records: ReadonlyMap<string, number>,
  pending: ReadonlySet<string>,
): ReminderCharge[] | undefined {
  if (!data.charges) return undefined;
  return data.charges.map((c) => {
    const recorded = records.get(c.txId);
    if (recorded !== undefined) return { ...c, status: "recorded", recorded: recorded / 100 };
    return { ...c, status: pending.has(c.txId) ? "pending" : "gone", recorded: null };
  });
}

/** The bell's feed: newest first, resolution checked live so recording a charge shows at once. */
export async function getNotificationFeed(): Promise<NotificationsPayload> {
  const db = await getDb();
  const page = () =>
    all<Row>(db, `SELECT ${COLUMNS} FROM notifications WHERE silent = 0 ORDER BY created_at DESC, id DESC LIMIT ?`, [FEED_LIMIT]);
  let rows = await page();
  let pending = new Set<string>();
  let records: ReadonlyMap<string, number> = new Map();
  if (rows.some((r) => r.type === "reimbursement_reminder" || (!r.resolved_at && RESOLVABLE.includes(r.type)))) {
    // The detection snapshot is cached until the data changes, so this is cheap on a poll.
    const snapshot = await loadSnapshot(db);
    if (await resolveOpen(db, snapshot, new Date())) rows = await page();
    pending = new Set(snapshot.pendingCharges.map((c) => c.txId));
    records = (await detection()).reimbursement.records;
  }
  const unread = await all<{ n: number }>(
    db,
    "SELECT COUNT(*) AS n FROM notifications WHERE silent = 0 AND read_at IS NULL AND resolved_at IS NULL",
  );
  return {
    items: rows.map((r): NotificationItem => {
      const data = parseData(r.data_json);
      const charges = r.type === "reimbursement_reminder" ? reminderCharges(data, records, pending) : undefined;
      return {
        id: Number(r.id),
        type: r.type,
        title: r.title,
        body: r.body,
        url: data.url,
        createdAt: r.created_at,
        read: Boolean(r.read_at),
        resolved: Boolean(r.resolved_at),
        ...(charges && { charges }),
      };
    }),
    unread: Number(unread[0]?.n ?? 0),
  };
}

/** Marks some (or, without ids, all) notifications read. */
export async function markRead(ids: number[] | "all"): Promise<void> {
  const db = await getDb();
  const at = new Date().toISOString();
  if (ids === "all") await run(db, "UPDATE notifications SET read_at = ? WHERE read_at IS NULL", [at]);
  else if (ids.length) {
    await run(db, `UPDATE notifications SET read_at = ? WHERE read_at IS NULL AND id IN (${ids.map(() => "?").join(", ")})`, [at, ...ids]);
  }
}
