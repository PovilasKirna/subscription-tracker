import { CADENCE_LABEL, fullDate, money, shortDate } from "../../format";
import { computeStats, isLive, projectCharges } from "../../insights";
import type { NotificationType, Settings } from "../../settings";
import { addDays, daysBetween, lastMonthlyDate, zonedParts } from "../../timeZone";
import type { ReimbursementMode, Subscription } from "../../types";

// What to notify about, decided from a snapshot of the data: pure (no DB, no clock of its own), so
// every rule is unit-tested and any trigger (cron, timer, after a sync) gets the same answer.
// Each candidate carries a dedupe key; the runner inserts it once and later asks isResolved().

/** A charge a request-mode source should pay back, with nothing recorded yet. */
export type PendingCharge = {
  /** The payment that stands for the charge (what "Got €X" records against). */
  txId: string;
  subKey: string;
  name: string;
  date: string;
  /** What was charged, positive, major units. */
  amount: number;
  /** What should come back. */
  expected: number;
  currency: string;
  sourceId: number;
};

export type SnapshotSource = { id: number; name: string; mode: ReimbursementMode; reminderDay: number | null };

export type SnapshotBankSession = {
  sessionId: string;
  aspsp: string;
  status: "active" | "needs_reconnect";
  validUntil: string | null;
  lastError: string | null;
  lastSyncAt: string | null;
  /** Set after a bank rate limit: not a failure the user has to act on. */
  nextRetryAt: string | null;
};

export type NotificationSnapshot = {
  /** Detected subscriptions (ignored ones left out). */
  subscriptions: Subscription[];
  pendingCharges: PendingCharge[];
  sources: SnapshotSource[];
  bankSessions: SnapshotBankSession[];
  /**
   * Subscription keys earlier runs have already seen, so only genuinely new ones are announced.
   * null before the first run that found any: that run is the silent baseline.
   */
  knownSubscriptions: ReadonlySet<string> | null;
  /** When notifications last ran before this run (ISO), so a missed reminder or digest can be told from one already looked at. */
  lastRunAt: string | null;
};

/** What the feed and the delivery channels need besides title/body; stored as `data_json`. */
export type NotificationData = {
  /** App path the notification opens, e.g. "/subscriptions?sub=netflix|EUR". */
  url: string | null;
  subKey?: string;
  sourceId?: number;
  sessionId?: string;
  /** bank_attention */
  reason?: "reconnect" | "expiring";
  validUntil?: string | null;
  /** bank_attention "reconnect" raised only because the access date passed (no sync has noticed yet). */
  expired?: boolean;
  /** sync_error: the last successful sync when it failed. */
  lastSyncAt?: string | null;
  /** yearly_renewal / subscription_overdue: the charge date it is about. */
  date?: string;
  /** reimbursement_reminder: the charges it asked about. */
  charges?: Omit<PendingCharge, "sourceId">[];
};

export type NotificationCandidate = {
  dedupeKey: string;
  type: NotificationType;
  title: string;
  body: string;
  data: NotificationData;
  /** Recorded only to dedupe against later runs; never shown or sent (the first-run baseline). */
  silent?: boolean;
};

/** A reminder or digest missed (e.g. only a daily cron that runs before the delivery hour) still goes out this many days later. */
export const CATCH_UP_DAYS = 2;
/** A subscription not seen before is announced only if it just started: a recent latest charge and a short history. */
export const NEW_SUBSCRIPTION_WINDOW_DAYS = 35;
export const NEW_SUBSCRIPTION_MAX_CHARGES = 5;
export const RENEWAL_NOTICE_DAYS = 7;
export const BANK_EXPIRY_NOTICE_DAYS = 7;
/** Older price changes / missed charges aren't news any more (and stay below the 90-day retention). */
export const PRICE_CHANGE_WINDOW_DAYS = 35;
export const OVERDUE_WINDOW_DAYS = 60;

const subUrl = (key: string) => `/subscriptions?${new URLSearchParams({ sub: key })}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "€30.00" or "€30.00 + $10.00" when charges are in several currencies. */
function totals(items: { amount: number; currency: string }[]): string {
  const by = new Map<string, number>();
  for (const i of items) by.set(i.currency, (by.get(i.currency) ?? 0) + i.amount);
  return [...by].map(([c, n]) => money(Math.round(n * 100) / 100, c)).join(" + ");
}

/** Short, stable fingerprint of an error message (so a different failure counts as a new one). */
function fingerprint(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Whether something scheduled for `scheduledDate` at the delivery hour (`lateBy` days ago, at most
 * CATCH_UP_DAYS) may go out now. From the delivery hour, yes. Before it, only on a catch-up day and
 * only if no run happened since the scheduled moment: a run then has already looked, so anything
 * that turns up later waits for the delivery hour instead of arriving in the night.
 */
function dueNow(local: { hour: number }, lateBy: number, scheduledDate: string, settings: Settings, lastRunAt: string | null): boolean {
  if (lateBy < 0 || lateBy > CATCH_UP_DAYS) return false;
  if (local.hour >= settings.deliveryHour) return true;
  if (lateBy === 0) return false;
  if (!lastRunAt || !Number.isFinite(Date.parse(lastRunAt))) return true;
  const last = zonedParts(new Date(lastRunAt), settings.timeZone);
  const ranSince = last.date > scheduledDate || (last.date === scheduledDate && last.hour >= settings.deliveryHour);
  return !ranSince;
}

function reimbursementReminders(snapshot: NotificationSnapshot, settings: Settings, now: Date): NotificationCandidate[] {
  const local = zonedParts(now, settings.timeZone);
  const out: NotificationCandidate[] = [];
  for (const source of snapshot.sources) {
    if (source.mode !== "request" || !source.reminderDay) continue;
    // The latest reminder day on or before today, possibly last month's (28 Feb when it's 1 Mar).
    const scheduled = lastMonthlyDate(local.date, source.reminderDay);
    const lateBy = daysBetween(scheduled, local.date);
    // On the reminder day from the delivery hour, or a couple of days later if no run happened then.
    if (!dueNow(local, lateBy, scheduled, settings, snapshot.lastRunAt)) continue;
    const charges = snapshot.pendingCharges
      .filter((c) => c.sourceId === source.id && c.date <= local.date)
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    if (!charges.length) continue;
    const names = [...new Set(charges.map((c) => c.name))];
    const subs = [...new Set(charges.map((c) => c.subKey))];
    out.push({
      // Keyed by the reminder's own month: a catch-up on the 1st must not use up next month's key.
      dedupeKey: `reimburse:${source.id}:${scheduled.slice(0, 7)}`,
      type: "reimbursement_reminder",
      title: `Request your ${source.name} reimbursements`,
      body: `${plural(charges.length, "charge")} waiting, ${totals(charges.map((c) => ({ amount: c.expected, currency: c.currency })))} back: ${names.join(", ")}.`,
      data: {
        url: subs.length === 1 ? subUrl(subs[0]) : "/settings/reimbursements",
        sourceId: source.id,
        charges: charges.map(({ sourceId: _, ...c }) => c),
      },
    });
  }
  return out;
}

function bankAttention(snapshot: NotificationSnapshot, settings: Settings, now: Date): NotificationCandidate[] {
  const today = zonedParts(now, settings.timeZone).date;
  const out: NotificationCandidate[] = [];
  for (const s of snapshot.bankSessions) {
    const until = s.validUntil ? Date.parse(s.validUntil) : null;
    const data = { url: "/settings/data", sessionId: s.sessionId, validUntil: s.validUntil };
    if (s.status === "needs_reconnect" || (until !== null && until <= now.getTime())) {
      out.push({
        dedupeKey: `bank:${s.sessionId}:reconnect:${s.validUntil ?? ""}`,
        type: "bank_attention",
        title: `Reconnect ${s.aspsp}`,
        body: s.lastError ?? `${s.aspsp} access has ended, so new transactions aren't syncing. Reconnect to keep them coming.`,
        data: { ...data, reason: "reconnect", ...(s.status !== "needs_reconnect" && { expired: true }) },
      });
    } else if (until !== null && until - now.getTime() <= BANK_EXPIRY_NOTICE_DAYS * 86_400_000 && s.validUntil) {
      const endsOn = zonedParts(new Date(until), settings.timeZone).date;
      const left = daysBetween(today, endsOn);
      out.push({
        dedupeKey: `bank:${s.sessionId}:expiring:${s.validUntil}`,
        type: "bank_attention",
        title: `${s.aspsp} access ends ${left <= 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`}`,
        body: `Reconnect before ${fullDate(endsOn)} to keep syncing. It only takes a minute in the bank's app.`,
        data: { ...data, reason: "expiring" },
      });
    }
  }
  return out;
}

function syncErrors(snapshot: NotificationSnapshot): NotificationCandidate[] {
  return snapshot.bankSessions
    .filter((s) => s.status === "active" && s.lastError && !s.nextRetryAt)
    .map((s) => ({
      dedupeKey: `sync:${s.sessionId}:${s.lastSyncAt ?? "never"}:${fingerprint(s.lastError ?? "")}`,
      type: "sync_error" as const,
      title: `${s.aspsp} sync failed`,
      body: s.lastError ?? "",
      data: { url: "/settings/data", sessionId: s.sessionId, lastSyncAt: s.lastSyncAt },
    }));
}

function subscriptionEvents(snapshot: NotificationSnapshot, settings: Settings, now: Date): NotificationCandidate[] {
  const today = zonedParts(now, settings.timeZone).date;
  const baseline = snapshot.knownSubscriptions === null;
  const out: NotificationCandidate[] = [];
  for (const s of snapshot.subscriptions) {
    if (!isLive(s)) continue;
    const m = (n: number) => money(n, s.currency);
    const url = subUrl(s.key);

    // Not seen before and just started. A long or old history (another account's CSV, an older
    // statement imported later) is existing history, not news, so it joins the known set silently.
    const started = s.lastCharge >= addDays(today, -NEW_SUBSCRIPTION_WINDOW_DAYS) && s.chargeCount <= NEW_SUBSCRIPTION_MAX_CHARGES;
    if (snapshot.knownSubscriptions && !snapshot.knownSubscriptions.has(s.key) && started) {
      out.push({
        dedupeKey: `new:${s.key}`,
        type: "new_subscription",
        title: `New subscription: ${s.name}`,
        body: `${m(s.amount)} ${CADENCE_LABEL[s.cadence].toLowerCase()}, first charged ${fullDate(s.firstCharge)}.`,
        data: { url, subKey: s.key },
      });
    }

    for (const pc of s.priceChanges) {
      if (pc.to <= pc.from || pc.date < addDays(today, -PRICE_CHANGE_WINDOW_DAYS)) continue;
      const pct = Math.round(((pc.to - pc.from) / pc.from) * 100);
      out.push({
        dedupeKey: `price:${s.key}:${pc.date}`,
        type: "price_increase",
        title: `${s.name} price went up`,
        body: `${m(pc.from)} → ${m(pc.to)} (+${pct}%) from the ${shortDate(pc.date)} charge.`,
        data: { url, subKey: s.key, date: pc.date },
        ...(baseline && { silent: true }),
      });
    }

    const next = s.nextCharge;
    if (s.status === "active" && s.cadence === "yearly" && next && next > today && next <= addDays(today, RENEWAL_NOTICE_DAYS)) {
      const left = daysBetween(today, next);
      out.push({
        dedupeKey: `renewal:${s.key}:${next}`,
        type: "yearly_renewal",
        title: `${s.name} renews ${left === 1 ? "tomorrow" : `in ${left} days`}`,
        body: `Yearly renewal of about ${m(s.amount)} on ${fullDate(next)}. Cancel before then if you don't need it.`,
        data: { url, subKey: s.key, date: next },
      });
    }

    if (s.status === "late" && next && next >= addDays(today, -OVERDUE_WINDOW_DAYS)) {
      out.push({
        dedupeKey: `overdue:${s.key}:${next}`,
        type: "subscription_overdue",
        title: `${s.name} hasn't charged yet`,
        body: `${m(s.amount)} was expected around ${fullDate(next)}. If you cancelled it, mark it as cancelled.`,
        data: { url, subKey: s.key, date: next },
        ...(baseline && { silent: true }),
      });
    }
  }
  return out;
}

/**
 * Everything that deserves a notification right now. Idempotent: the same snapshot and time give
 * the same dedupe keys, so calling it every hour only ever adds what is new.
 */
export function planNotifications(snapshot: NotificationSnapshot, settings: Settings, now: Date): NotificationCandidate[] {
  return [
    ...reimbursementReminders(snapshot, settings, now),
    ...bankAttention(snapshot, settings, now),
    ...syncErrors(snapshot),
    ...subscriptionEvents(snapshot, settings, now),
  ];
}

/**
 * Whether the thing a notification is about has been dealt with: every charge recorded, the bank
 * reconnected, the late charge arrived… Informational ones (new subscription, price increase)
 * never resolve; they're just read.
 */
export function isResolved(n: { type: NotificationType; data: NotificationData }, snapshot: NotificationSnapshot): boolean {
  const { data } = n;
  const sub = data.subKey ? snapshot.subscriptions.find((s) => s.key === data.subKey) : undefined;
  const session = data.sessionId ? snapshot.bankSessions.find((s) => s.sessionId === data.sessionId) : undefined;
  switch (n.type) {
    case "reimbursement_reminder": {
      const pending = new Set(snapshot.pendingCharges.map((c) => c.txId));
      return !(data.charges ?? []).some((c) => pending.has(c.txId));
    }
    case "bank_attention":
      if (!session) return true; // disconnected, or replaced by a reconnect
      if (data.reason === "reconnect") return session.status === "active" && (!data.expired || session.validUntil !== data.validUntil);
      return session.status === "needs_reconnect" || session.validUntil !== data.validUntil;
    case "sync_error":
      return !session?.lastError || session.lastSyncAt !== (data.lastSyncAt ?? null);
    case "yearly_renewal":
      // Charged (the next charge moved on), cancelled or gone.
      return sub?.status !== "active" || sub.nextCharge !== data.date;
    case "subscription_overdue":
      return sub?.status !== "late" || sub.nextCharge !== data.date;
    default:
      return false;
  }
}

/** Every subscription key in the snapshot, for the "already seen" set. */
export const seenSubscriptions = (snapshot: NotificationSnapshot) => snapshot.subscriptions.map((s) => s.key);

// Digest -------------------------------------------------------------------------------------

/** One item of the digest's "since your last summary" list (same shape as PR4's email template input). */
export type DigestEvent = { title: string; body: string; url?: string | null; at: string };
export type DigestRenewal = { name: string; date: string; amount: number; currency: string };
export type DigestSummary = {
  currency: string;
  /** Monthly cost of live subscriptions after expected reimbursements. */
  netMonthlyCost: number;
  /** Expected back per month (already subtracted above). */
  reimbursedMonthly?: number;
  upcomingRenewals: DigestRenewal[];
  outstandingReimbursements: { count: number; amount: number };
};
/** What an email channel turns into the digest email (PR4's `DigestEmailProps` minus `appUrl`). */
export type DigestInput = {
  frequency: "weekly" | "monthly";
  /** Newest first; may be empty: the digest still goes out. */
  events: DigestEvent[];
  summary: DigestSummary;
  timeZone: string;
};

export type DigestSlot = { key: string; frequency: "weekly" | "monthly"; periodStart: string; periodEnd: string };

/**
 * The digest that should go out now, if any: weekly on Mondays, monthly on the 1st, from the
 * delivery hour (or a couple of days later when no run happened then). `lastKey` is the slot sent
 * last, so each period gets one digest; `lastRunAt` is the previous run (see NotificationSnapshot).
 */
export function digestDue(settings: Settings, now: Date, lastKey: string | null, lastRunAt: string | null = null): DigestSlot | null {
  if (settings.digestFrequency === "off") return null;
  const local = zonedParts(now, settings.timeZone);
  const weekly = settings.digestFrequency === "weekly";
  // This week's Monday or this month's 1st: never after today, so a catch-up never crosses a period.
  const periodStart = weekly ? addDays(local.date, 1 - local.weekday) : lastMonthlyDate(local.date, 1);
  const lateBy = daysBetween(periodStart, local.date);
  if (!dueNow(local, lateBy, periodStart, settings, lastRunAt)) return null;
  const [y, mo] = periodStart.split("-").map(Number);
  const periodEnd = weekly ? addDays(periodStart, 7) : mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
  const key = `${settings.digestFrequency}:${periodStart}`;
  return key === lastKey ? null : { key, frequency: weekly ? "weekly" : "monthly", periodStart, periodEnd };
}

/** The digest's content: events since the last one plus where things stand. */
export function buildDigest(
  slot: DigestSlot,
  events: DigestEvent[],
  snapshot: NotificationSnapshot,
  settings: Settings,
  baseCurrency: string,
  now: Date,
): DigestInput {
  const today = zonedParts(now, settings.timeZone).date;
  const stats = computeStats({ baseCurrency, today, subscriptions: snapshot.subscriptions, ignored: [] });
  const renewals = projectCharges(snapshot.subscriptions, today, Math.max(1, daysBetween(today, slot.periodEnd)));
  const pending = snapshot.pendingCharges;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    frequency: slot.frequency,
    events: [...events].sort((a, b) => b.at.localeCompare(a.at)),
    summary: {
      currency: baseCurrency,
      netMonthlyCost: round2(stats.monthly),
      reimbursedMonthly: round2(stats.reimbursedMonthly),
      upcomingRenewals: renewals.map((r) => ({ name: r.name, date: r.date, amount: r.amount, currency: r.currency })),
      outstandingReimbursements: {
        count: pending.length,
        amount: round2(pending.filter((c) => c.currency === baseCurrency).reduce((sum, c) => sum + c.expected, 0)),
      },
    },
    timeZone: settings.timeZone,
  };
}
