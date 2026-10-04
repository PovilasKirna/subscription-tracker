import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { all, one, openDb, run } from "../lib/server/db";
import type { NotificationChannel, OutgoingNotification } from "../lib/server/notifications/channels";
import {
  buildDigest,
  type DigestInput,
  digestDue,
  isResolved,
  type NotificationSnapshot,
  type PendingCharge,
  planNotifications,
} from "../lib/server/notifications/plan";
import { processNotifications } from "../lib/server/notifications/run";
import { recordTick, schedulerHealth } from "../lib/server/notifications/scheduler";
import { getSettings, getState, saveSettings, swapState } from "../lib/server/settings";
import { DEFAULT_SETTINGS, parseSettingsPatch, type Settings, settingsFromStore } from "../lib/settings";
import { isValidTimeZone, zonedParts } from "../lib/timeZone";
import type { Subscription } from "../lib/types";

// --- fixtures -----------------------------------------------------------------------------------

function sub(over: Partial<Subscription> & { key: string }): Subscription {
  return {
    merchantKey: over.key.split("|")[0],
    name: over.key.split("|")[0],
    category: "Other",
    currency: "EUR",
    cadence: "monthly",
    cadenceChosen: false,
    periodDays: 30.44,
    amount: 10,
    monthlyCost: 10,
    yearlyCost: 120,
    firstCharge: "2026-01-05",
    lastCharge: "2026-09-05",
    nextCharge: "2026-10-05",
    chargeCount: 9,
    totalSpent: 90,
    status: "active",
    confidence: 1,
    confirmed: false,
    pinned: false,
    known: true,
    color: null,
    colorChosen: false,
    website: null,
    websiteChosen: false,
    priceChanges: [],
    charges: [],
    reimbursement: null,
    reimbursementPeriods: [],
    netMonthlyCost: 10,
    totalReimbursed: 0,
    pendingReimbursements: 0,
    ...over,
  };
}

const charge = (txId: string, date: string, over: Partial<PendingCharge> = {}): PendingCharge => ({
  txId,
  subKey: "claude|EUR",
  name: "Claude",
  date,
  amount: 18,
  expected: 18,
  currency: "EUR",
  sourceId: 1,
  ...over,
});

function snapshot(over: Partial<NotificationSnapshot> = {}): NotificationSnapshot {
  return {
    subscriptions: [],
    pendingCharges: [],
    sources: [
      { id: 1, name: "Salary", mode: "request", reminderDay: 20 },
      { id: 2, name: "Insurer", mode: "automatic", reminderDay: null },
    ],
    bankSessions: [],
    knownSubscriptions: new Set(),
    lastRunAt: null,
    ...over,
  };
}

const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over });
/** Vilnius is UTC+3 in summer time (until 25 Oct 2026), UTC+2 in winter. */
const at = (iso: string) => new Date(iso);
const keys = (cs: { dedupeKey: string }[]) => cs.map((c) => c.dedupeKey).sort();

// --- time zones & settings ----------------------------------------------------------------------

test("zonedParts reads the wall clock of the zone, across day and month boundaries", () => {
  assert.deepEqual(zonedParts(at("2026-10-19T21:30:00Z"), "Europe/Vilnius"), {
    date: "2026-10-20",
    month: "2026-10",
    day: 20,
    hour: 0,
    weekday: 2,
  });
  assert.equal(zonedParts(at("2026-10-31T22:30:00Z"), "Europe/Vilnius").date, "2026-11-01"); // winter time: +2
  assert.equal(zonedParts(at("2026-10-01T02:00:00Z"), "America/New_York").date, "2026-09-30");
  assert.equal(zonedParts(at("2026-10-05T00:00:00Z"), "UTC").weekday, 1); // a Monday
  assert.equal(zonedParts(at("2026-10-04T23:59:00Z"), "UTC").hour, 23);
});

test("settings: defaults fill in anything missing or invalid; patches are validated", () => {
  assert.deepEqual(settingsFromStore(new Map()), DEFAULT_SETTINGS);
  const stored = settingsFromStore(
    new Map<string, unknown>([
      ["timeZone", "Mars/Olympus"],
      ["deliveryHour", 7],
      ["notify.price_increase", { push: false }],
      ["digestFrequency", "daily"],
    ]),
  );
  assert.equal(stored.timeZone, "Europe/Vilnius");
  assert.equal(stored.deliveryHour, 7);
  assert.deepEqual(stored.notifications.price_increase, { push: false, email: "digest" });
  assert.equal(stored.digestFrequency, "weekly");

  assert.ok(isValidTimeZone("America/New_York"));
  assert.ok(!isValidTimeZone("Nowhere/Town"));
  assert.deepEqual(parseSettingsPatch({ deliveryHour: 23, timeZone: "UTC" }), { patch: { deliveryHour: 23, timeZone: "UTC" } });
  assert.ok("error" in parseSettingsPatch({ deliveryHour: 24 }));
  assert.ok("error" in parseSettingsPatch({ deliveryHour: 8.5 }));
  assert.ok("error" in parseSettingsPatch({ colour: "red" }));
  assert.ok("error" in parseSettingsPatch({ notifications: { birthday: { push: true } } }));
  assert.ok("error" in parseSettingsPatch({ notifications: { sync_error: { email: "sometimes" } } }));
  assert.ok("error" in parseSettingsPatch({ emailRecipient: "not-an-email" }));
  assert.deepEqual(parseSettingsPatch({ emailRecipient: "  me@example.com " }), { patch: { emailRecipient: "me@example.com" } });
  assert.deepEqual(parseSettingsPatch({ emailRecipient: "" }), { patch: { emailRecipient: "" } });
});

// --- reimbursement reminders --------------------------------------------------------------------

const pending = [charge("t1", "2026-09-03"), charge("t2", "2026-10-03"), charge("t3", "2026-10-07", { sourceId: 9, name: "Other" })];

test("reimbursement reminder: on the reminder day from the delivery hour, in the user's time zone", () => {
  const s = snapshot({ pendingCharges: pending });
  // 20 Oct 08:59 in Vilnius (05:59 UTC): too early.
  assert.deepEqual(planNotifications(s, settings(), at("2026-10-20T05:59:00Z")), []);
  // 09:00 Vilnius.
  const [r] = planNotifications(s, settings(), at("2026-10-20T06:00:00Z"));
  assert.equal(r.type, "reimbursement_reminder");
  assert.equal(r.dedupeKey, "reimburse:1:2026-10");
  assert.equal(r.title, "Request your Salary reimbursements");
  assert.deepEqual(
    r.data.charges?.map((c) => c.txId),
    ["t1", "t2"],
  );
  assert.match(r.body, /2 charges waiting, €36\.00 back: Claude\./);
  assert.equal(r.data.url, "/subscriptions?sub=claude%7CEUR");
  // 19 Oct 22:00 UTC is 20 Oct 01:00 in Vilnius: the right day, but before the delivery hour…
  assert.deepEqual(planNotifications(s, settings(), at("2026-10-19T22:00:00Z")), []);
  // …unless the delivery hour is midnight.
  assert.equal(planNotifications(s, settings({ deliveryHour: 0 }), at("2026-10-19T22:00:00Z")).length, 1);
  // In UTC the same instant is still the 19th: no reminder.
  assert.deepEqual(planNotifications(s, settings({ deliveryHour: 0, timeZone: "UTC" }), at("2026-10-19T22:00:00Z")), []);
});

test("reimbursement reminder: catches up for two days after a missed reminder day, never before it", () => {
  const s = snapshot({ pendingCharges: pending });
  assert.deepEqual(planNotifications(s, settings(), at("2026-10-19T12:00:00Z")), []);
  // 21st and 22nd at any hour (e.g. a daily cron running before the delivery hour).
  assert.equal(planNotifications(s, settings(), at("2026-10-21T02:00:00Z")).length, 1);
  assert.equal(planNotifications(s, settings(), at("2026-10-22T02:00:00Z")).length, 1);
  assert.deepEqual(planNotifications(s, settings(), at("2026-10-23T12:00:00Z")), []);
});

test("reimbursement reminder: catch-up days stay quiet before the delivery hour when a run already looked", () => {
  const s = (lastRunAt: string | null) => snapshot({ pendingCharges: pending, lastRunAt });
  const night = at("2026-10-21T00:00:00Z"); // 21 Oct 03:00 Vilnius
  // Hourly runs went through the 20th after 09:00 (nothing was pending then, say): a charge that
  // turns up in the night waits for the delivery hour…
  assert.deepEqual(planNotifications(s("2026-10-20T20:00:00Z"), settings(), night), []);
  assert.equal(planNotifications(s("2026-10-20T20:00:00Z"), settings(), at("2026-10-21T06:00:00Z")).length, 1);
  // …but a run that only happened before the delivery hour (a daily cron at 08:00) missed it.
  assert.equal(planNotifications(s("2026-10-20T05:00:00Z"), settings(), night).length, 1);
  assert.equal(planNotifications(s("2026-10-19T12:00:00Z"), settings(), night).length, 1);
  assert.equal(planNotifications(s(null), settings(), night).length, 1);
  // Missed on the 20th, looked at on the 21st after 09:00: the 22nd's night is quiet again.
  assert.deepEqual(planNotifications(s("2026-10-21T07:00:00Z"), settings(), at("2026-10-22T00:00:00Z")), []);
});

test("reimbursement reminder: only request sources with pending charges, one key per month", () => {
  const now = at("2026-10-20T12:00:00Z");
  assert.deepEqual(planNotifications(snapshot(), settings(), now), []);
  // Charges from an automatic source never remind.
  const auto = snapshot({ pendingCharges: [charge("a", "2026-10-01", { sourceId: 2 })] });
  assert.deepEqual(planNotifications(auto, settings(), now), []);
  // Several subscriptions: links to the sources page and lists every name.
  const two = snapshot({ pendingCharges: [charge("t1", "2026-10-03"), charge("t9", "2026-10-04", { subKey: "gym|EUR", name: "Gym" })] });
  const [r] = planNotifications(two, settings(), now);
  assert.equal(r.data.url, "/settings/reimbursements");
  assert.match(r.body, /Claude, Gym/);
  // Next month's reminder has its own key.
  assert.equal(planNotifications(two, settings(), at("2026-11-20T12:00:00Z"))[0].dedupeKey, "reimburse:1:2026-11");
});

test("planning is idempotent: same snapshot and time, same candidates", () => {
  const s = snapshot({
    pendingCharges: pending,
    subscriptions: [sub({ key: "adobe|EUR", cadence: "yearly", nextCharge: "2026-10-25", amount: 240 })],
  });
  const now = at("2026-10-20T12:00:00Z");
  assert.deepEqual(planNotifications(s, settings(), now), planNotifications(s, settings(), now));
});

// --- bank, sync -----------------------------------------------------------------------------------

const session = {
  sessionId: "s1",
  aspsp: "Revolut",
  status: "active" as const,
  validUntil: "2027-03-01T00:00:00Z",
  lastError: null,
  lastSyncAt: "2026-10-20T05:00:00Z",
  nextRetryAt: null,
};

test("bank attention: needs reconnect, expired, or access ending within 7 days", () => {
  const now = at("2026-10-20T12:00:00Z");
  assert.deepEqual(planNotifications(snapshot({ bankSessions: [session] }), settings(), now), []);

  const lost = { ...session, status: "needs_reconnect" as const, lastError: "Access was revoked" };
  const [r] = planNotifications(snapshot({ bankSessions: [lost] }), settings(), now);
  assert.equal(r.dedupeKey, "bank:s1:reconnect:2027-03-01T00:00:00Z");
  assert.equal(r.title, "Reconnect Revolut");
  assert.equal(r.body, "Access was revoked");

  const ending = { ...session, validUntil: "2026-10-25T10:00:00Z" };
  const [e] = planNotifications(snapshot({ bankSessions: [ending] }), settings(), now);
  assert.equal(e.dedupeKey, "bank:s1:expiring:2026-10-25T10:00:00Z");
  assert.equal(e.title, "Revolut access ends in 5 days");
  assert.equal(
    planNotifications(snapshot({ bankSessions: [{ ...session, validUntil: "2026-10-28T13:00:00Z" }] }), settings(), now).length,
    0,
  );

  // The date passed but no sync noticed yet.
  const expired = { ...session, validUntil: "2026-10-19T00:00:00Z" };
  assert.equal(planNotifications(snapshot({ bankSessions: [expired] }), settings(), now)[0].data.reason, "reconnect");
});

test("sync error: once per failure, not for rate limits or a lost connection", () => {
  const now = at("2026-10-20T12:00:00Z");
  const failed = { ...session, lastError: "Bank timed out" };
  const [r] = planNotifications(snapshot({ bankSessions: [failed] }), settings(), now);
  assert.equal(r.type, "sync_error");
  assert.equal(r.title, "Revolut sync failed");
  // Same failure again: same key. Another message or a later success: a new one.
  assert.equal(planNotifications(snapshot({ bankSessions: [failed] }), settings(), now)[0].dedupeKey, r.dedupeKey);
  assert.notEqual(
    planNotifications(snapshot({ bankSessions: [{ ...failed, lastError: "500" }] }), settings(), now)[0].dedupeKey,
    r.dedupeKey,
  );
  assert.deepEqual(
    planNotifications(snapshot({ bankSessions: [{ ...failed, nextRetryAt: "2026-10-20T18:00:00Z" }] }), settings(), now),
    [],
  );
});

// --- subscriptions --------------------------------------------------------------------------------

test("price increase: recent increases only; silent during the baseline", () => {
  const now = at("2026-10-20T12:00:00Z");
  const netflix = sub({
    key: "netflix|EUR",
    name: "Netflix",
    priceChanges: [
      { date: "2026-03-01", from: 12, to: 14 }, // too old
      { date: "2026-10-01", from: 14, to: 15.99 },
      { date: "2026-10-10", from: 15.99, to: 13 }, // a decrease
    ],
  });
  const [r] = planNotifications(snapshot({ subscriptions: [netflix], knownSubscriptions: new Set(["netflix|EUR"]) }), settings(), now);
  assert.equal(r.dedupeKey, "price:netflix|EUR:2026-10-01");
  assert.equal(r.body, "€14.00 → €15.99 (+14%) from the 1 Oct charge.");
  assert.ok(!r.silent);
  const [b] = planNotifications(snapshot({ subscriptions: [netflix], knownSubscriptions: null }), settings(), now);
  assert.equal(b.silent, true);
  // Inactive or cancelled subscriptions don't notify.
  assert.deepEqual(planNotifications(snapshot({ subscriptions: [{ ...netflix, status: "cancelled" }] }), settings(), now), []);
});

test("yearly renewal: 7 days ahead for yearly subscriptions only", () => {
  const adobe = sub({ key: "adobe|EUR", name: "Adobe", cadence: "yearly", amount: 239.88, nextCharge: "2026-10-27" });
  const known = new Set(["adobe|EUR", "spotify|EUR"]);
  const plan = (now: string, subs = [adobe]) =>
    planNotifications(snapshot({ subscriptions: subs, knownSubscriptions: known }), settings(), at(now));
  assert.deepEqual(plan("2026-10-19T12:00:00Z"), []); // 8 days ahead
  const [r] = plan("2026-10-20T12:00:00Z");
  assert.equal(r.dedupeKey, "renewal:adobe|EUR:2026-10-27");
  assert.equal(r.title, "Adobe renews in 7 days");
  assert.equal(plan("2026-10-26T12:00:00Z")[0].title, "Adobe renews tomorrow");
  assert.deepEqual(plan("2026-10-27T12:00:00Z"), []); // the day itself: too late to be a heads-up
  // Day boundary in the user's zone: 19 Oct 21:30 UTC is already the 20th in Vilnius.
  assert.equal(plan("2026-10-19T21:30:00Z").length, 1);
  assert.deepEqual(plan("2026-10-20T12:00:00Z", [sub({ key: "spotify|EUR", nextCharge: "2026-10-25" })]), []);
});

const fresh = { firstCharge: "2026-08-15", lastCharge: "2026-10-15", nextCharge: "2026-11-15", chargeCount: 3 };

test("new subscription: only ones not seen before, never during the baseline", () => {
  const now = at("2026-10-20T12:00:00Z");
  const subs = [
    sub({ key: "a|EUR", name: "Alpha", ...fresh }),
    sub({ key: "b|EUR", name: "Beta", ...fresh }),
    sub({ key: "c|EUR", status: "inactive", ...fresh }),
  ];
  assert.deepEqual(keys(planNotifications(snapshot({ subscriptions: subs, knownSubscriptions: null }), settings(), now)), []);
  const r = planNotifications(snapshot({ subscriptions: subs, knownSubscriptions: new Set(["a|EUR"]) }), settings(), now);
  assert.deepEqual(keys(r), ["new:b|EUR"]);
  assert.equal(r[0].title, "New subscription: Beta");
  assert.equal(r[0].body, "€10.00 monthly, first charged 15 Aug 2026.");
});

test("new subscription: history imported later (long, or old) is not announced", () => {
  const now = at("2026-10-20T12:00:00Z");
  const plan = (s: Subscription) =>
    planNotifications(snapshot({ subscriptions: [s], knownSubscriptions: new Set(["a|EUR"]) }), settings(), now);
  // Another account's CSV with years of history.
  assert.deepEqual(plan(sub({ key: "gym|EUR", firstCharge: "2023-01-10", lastCharge: "2026-10-10", chargeCount: 46 })), []);
  // An older statement: the subscription ended long ago (or its latest charge is old).
  assert.deepEqual(plan(sub({ key: "hbo|EUR", firstCharge: "2025-01-10", lastCharge: "2025-03-10", chargeCount: 3 })), []);
  // A yearly one that just renewed for the second time is new.
  assert.equal(
    plan(sub({ key: "vpn|EUR", cadence: "yearly", firstCharge: "2025-10-01", lastCharge: "2026-10-01", chargeCount: 2 })).length,
    1,
  );
});

test("subscription overdue: late subscriptions, silent in the baseline, not once long overdue", () => {
  const now = at("2026-10-20T12:00:00Z");
  const late = sub({ key: "gym|EUR", name: "Gym", status: "late", nextCharge: "2026-10-05" });
  const known = new Set(["gym|EUR"]);
  const [r] = planNotifications(snapshot({ subscriptions: [late], knownSubscriptions: known }), settings(), now);
  assert.equal(r.dedupeKey, "overdue:gym|EUR:2026-10-05");
  assert.equal(r.title, "Gym hasn't charged yet");
  assert.equal(planNotifications(snapshot({ subscriptions: [late], knownSubscriptions: null }), settings(), now)[0].silent, true);
  const old = { ...late, nextCharge: "2026-08-01" };
  assert.deepEqual(planNotifications(snapshot({ subscriptions: [old], knownSubscriptions: known }), settings(), now), []);
});

// --- resolution -----------------------------------------------------------------------------------

test("isResolved: reminders when no listed charge is pending any more", () => {
  const n = {
    type: "reimbursement_reminder" as const,
    data: { url: null, charges: [charge("t1", "2026-09-03"), charge("t2", "2026-10-03")] },
  };
  assert.equal(isResolved(n, snapshot({ pendingCharges: pending })), false);
  assert.equal(isResolved(n, snapshot({ pendingCharges: [pending[1]] })), false);
  assert.equal(isResolved(n, snapshot({ pendingCharges: [pending[2]] })), true);
});

test("isResolved: bank attention once reconnected, renewed or disconnected", () => {
  const reconnect = {
    type: "bank_attention" as const,
    data: { url: null, sessionId: "s1", reason: "reconnect" as const, validUntil: "2027-03-01T00:00:00Z" },
  };
  assert.equal(isResolved(reconnect, snapshot({ bankSessions: [{ ...session, status: "needs_reconnect" }] })), false);
  assert.equal(isResolved(reconnect, snapshot({ bankSessions: [] })), true);
  assert.equal(isResolved(reconnect, snapshot({ bankSessions: [session] })), true);
  const expired = { ...reconnect, data: { ...reconnect.data, validUntil: "2026-10-19T00:00:00Z", expired: true } };
  assert.equal(isResolved(expired, snapshot({ bankSessions: [{ ...session, validUntil: "2026-10-19T00:00:00Z" }] })), false);
  const expiring = {
    type: "bank_attention" as const,
    data: { url: null, sessionId: "s1", reason: "expiring" as const, validUntil: "2026-10-25T10:00:00Z" },
  };
  assert.equal(isResolved(expiring, snapshot({ bankSessions: [{ ...session, validUntil: "2026-10-25T10:00:00Z" }] })), false);
  assert.equal(isResolved(expiring, snapshot({ bankSessions: [session] })), true);
});

test("isResolved: renewals and overdue charges once the charge arrives; informational never", () => {
  const renewal = { type: "yearly_renewal" as const, data: { url: null, subKey: "adobe|EUR", date: "2026-10-27" } };
  const adobe = sub({ key: "adobe|EUR", cadence: "yearly", nextCharge: "2026-10-27" });
  assert.equal(isResolved(renewal, snapshot({ subscriptions: [adobe] })), false);
  assert.equal(isResolved(renewal, snapshot({ subscriptions: [{ ...adobe, nextCharge: "2027-10-27" }] })), true);
  assert.equal(isResolved(renewal, snapshot({ subscriptions: [] })), true);
  const overdue = { type: "subscription_overdue" as const, data: { url: null, subKey: "gym|EUR", date: "2026-10-05" } };
  const gym = sub({ key: "gym|EUR", status: "late", nextCharge: "2026-10-05" });
  assert.equal(isResolved(overdue, snapshot({ subscriptions: [gym] })), false);
  assert.equal(isResolved(overdue, snapshot({ subscriptions: [{ ...gym, status: "active", nextCharge: "2026-11-05" }] })), true);
  assert.equal(isResolved({ type: "price_increase", data: { url: null, subKey: "gym|EUR" } }, snapshot()), false);
  assert.equal(isResolved({ type: "new_subscription", data: { url: null, subKey: "x|EUR" } }, snapshot()), false);
});

// --- digest & scheduler ---------------------------------------------------------------------------

test("digestDue: weekly on Mondays, monthly on the 1st, from the delivery hour, once per period", () => {
  const weekly = settings();
  // Monday 5 Oct 2026, 08:00 in Vilnius: too early; 09:00: due.
  assert.equal(digestDue(weekly, at("2026-10-05T05:00:00Z"), null), null);
  assert.deepEqual(digestDue(weekly, at("2026-10-05T06:00:00Z"), null), {
    key: "weekly:2026-10-05",
    frequency: "weekly",
    periodStart: "2026-10-05",
    periodEnd: "2026-10-12",
  });
  assert.equal(digestDue(weekly, at("2026-10-05T06:00:00Z"), "weekly:2026-10-05"), null);
  // Catch-up on Tuesday/Wednesday, not later.
  assert.equal(digestDue(weekly, at("2026-10-07T01:00:00Z"), "weekly:2026-09-28")?.key, "weekly:2026-10-05");
  assert.equal(digestDue(weekly, at("2026-10-08T12:00:00Z"), "weekly:2026-09-28"), null);
  // Sunday 22:30 UTC is Monday 01:30 in Vilnius.
  assert.equal(digestDue(settings({ deliveryHour: 1 }), at("2026-10-04T22:30:00Z"), null)?.periodStart, "2026-10-05");
  assert.equal(digestDue(settings({ deliveryHour: 1, timeZone: "UTC" }), at("2026-10-04T22:30:00Z"), null), null);

  const monthly = settings({ digestFrequency: "monthly" });
  assert.equal(digestDue(monthly, at("2026-10-05T06:00:00Z"), null), null);
  assert.deepEqual(digestDue(monthly, at("2026-12-01T07:00:00Z"), null), {
    key: "monthly:2026-12-01",
    frequency: "monthly",
    periodStart: "2026-12-01",
    periodEnd: "2027-01-01",
  });
  assert.equal(digestDue(settings({ digestFrequency: "off" }), at("2026-10-05T06:00:00Z"), null), null);
});

test("digestDue: a catch-up day before the delivery hour only when no run looked after it", () => {
  const tuesdayNight = at("2026-10-06T00:00:00Z"); // Tue 03:00 Vilnius
  // Hourly runs on Monday after 09:00 (the digest was off, or email not set up): wait for 09:00.
  assert.equal(digestDue(settings(), tuesdayNight, "weekly:2026-09-28", "2026-10-05T20:00:00Z"), null);
  assert.equal(digestDue(settings(), at("2026-10-06T06:00:00Z"), "weekly:2026-09-28", "2026-10-05T20:00:00Z")?.key, "weekly:2026-10-05");
  // Only a daily cron before the delivery hour ran on Monday: catch up now.
  assert.equal(digestDue(settings(), tuesdayNight, "weekly:2026-09-28", "2026-10-05T05:00:00Z")?.key, "weekly:2026-10-05");
});

test("buildDigest: totals, renewals in the coming period and outstanding reimbursements", () => {
  const subs = [
    sub({ key: "netflix|EUR", name: "Netflix", amount: 15, monthlyCost: 15, netMonthlyCost: 15, nextCharge: "2026-10-08" }),
    sub({ key: "claude|EUR", name: "Claude", amount: 18, monthlyCost: 18, netMonthlyCost: 0, nextCharge: "2026-10-20" }),
  ];
  const slot = { key: "weekly:2026-10-05", frequency: "weekly" as const, periodStart: "2026-10-05", periodEnd: "2026-10-12" };
  const d: DigestInput = buildDigest(
    slot,
    [
      { title: "Old", body: "", at: "2026-10-01T10:00:00Z" },
      { title: "New", body: "", at: "2026-10-03T10:00:00Z" },
    ],
    snapshot({ subscriptions: subs, pendingCharges: [charge("t1", "2026-09-03"), charge("t2", "2026-10-03", { currency: "USD" })] }),
    settings(),
    "EUR",
    at("2026-10-05T06:00:00Z"),
  );
  assert.equal(d.frequency, "weekly");
  assert.equal(d.timeZone, "Europe/Vilnius");
  assert.deepEqual(
    d.events.map((e) => e.title),
    ["New", "Old"],
  );
  assert.equal(d.summary.netMonthlyCost, 15);
  assert.equal(d.summary.reimbursedMonthly, 18);
  assert.deepEqual(d.summary.upcomingRenewals, [{ name: "Netflix", date: "2026-10-08", amount: 15, currency: "EUR" }]);
  assert.deepEqual(d.summary.outstandingReimbursements, { count: 2, amount: 18 });
});

test("schedulerHealth tells hourly from daily, stale and never", () => {
  const now = at("2026-10-20T12:10:00Z");
  assert.equal(schedulerHealth([], now).state, "never");
  assert.equal(schedulerHealth(["2026-10-20T12:00:00Z"], now).state, "waiting");
  const hourly = ["2026-10-20T09:00:05Z", "2026-10-20T10:00:02Z", "2026-10-20T11:00:09Z", "2026-10-20T12:00:01Z"];
  assert.deepEqual(schedulerHealth(hourly, now), { state: "hourly", lastTickAt: "2026-10-20T12:00:01.000Z", typicalGapMinutes: 60 });
  assert.equal(schedulerHealth(["2026-10-18T10:00:00Z", "2026-10-19T10:00:00Z", "2026-10-20T10:00:00Z"], now).state, "infrequent");
  assert.equal(schedulerHealth(hourly, at("2026-10-20T16:00:00Z")).state, "stale");
  // A second trigger firing alongside (Vercel's daily cron) doesn't hide the hourly rhythm.
  assert.equal(schedulerHealth([...hourly.slice(0, 3), "2026-10-20T11:00:30Z", "2026-10-20T12:00:01Z"], now).state, "hourly");
  let ticks: string[] = [];
  for (let i = 0; i < 12; i++) ticks = recordTick(ticks, `2026-10-20T${String(i).padStart(2, "0")}:00:00Z`);
  assert.equal(ticks.length, 8);
  assert.equal(ticks[7], "2026-10-20T11:00:00Z");
});

// --- the runner, against a real database ----------------------------------------------------------

const dir = mkdtempSync(join(tmpdir(), "st-notify-"));
const db = await openDb(`file:${join(dir, "n.db").replaceAll("\\", "/")}`);

type Sent = { kind: string; n: OutgoingNotification };
function fakeChannels(
  log: Sent[],
  opts: { failPush?: boolean; failDigest?: boolean; digests?: DigestInput[] } = {},
): NotificationChannel[] {
  return [
    {
      kind: "push",
      ready: () => true,
      send: async (n) => {
        if (opts.failPush) throw new Error("push service down");
        log.push({ kind: "push", n });
      },
    },
    {
      kind: "email",
      ready: (s) => Boolean(s.emailRecipient),
      send: async (n) => {
        log.push({ kind: "email", n });
      },
      sendDigest: async (d) => {
        if (opts.failDigest) throw new Error("mail provider rejected the sender");
        opts.digests?.push(d);
      },
    },
  ];
}

test("settings store: saves only what changed and merges per-type preferences", async () => {
  assert.deepEqual(await getSettings(db), DEFAULT_SETTINGS);
  const saved = await saveSettings(db, { deliveryHour: 8, notifications: { new_subscription: { push: true } } });
  assert.equal(saved.deliveryHour, 8);
  assert.deepEqual(saved.notifications.new_subscription, { push: true, email: "digest" });
  assert.equal(saved.timeZone, "Europe/Vilnius");
  await saveSettings(db, { deliveryHour: 9, notifications: { new_subscription: { push: false } } });
  assert.deepEqual(await getSettings(db), DEFAULT_SETTINGS);
  // Compare-and-swap state: only one of two racing writers wins.
  assert.equal(await swapState(db, "state.test", null, { a: 1 }), true);
  assert.equal(await swapState(db, "state.test", null, { a: 2 }), false);
  assert.equal(await swapState(db, "state.test", { a: 1 }, { a: 3 }), true);
  assert.deepEqual(await getState(db, "state.test"), { a: 3 });
  // Giving a claim back to "missing" deletes the key, so expecting null works again afterwards.
  assert.equal(await swapState(db, "state.test", { a: 2 }, null), false);
  assert.equal(await swapState(db, "state.test", { a: 3 }, null), true);
  assert.equal(await one(db, "SELECT value FROM settings WHERE key = 'state.test'"), undefined);
  assert.equal(await swapState(db, "state.test", null, { a: 4 }), true);
  // A stored JSON null (written by an older version) also counts as missing.
  await run(db, "UPDATE settings SET value = 'null' WHERE key = 'state.test'");
  assert.equal(await swapState(db, "state.test", null, { a: 5 }), true);
  assert.deepEqual(await getState(db, "state.test"), { a: 5 });
  await run(db, "DELETE FROM settings WHERE key = 'state.test'");
});

test("runner: baseline is silent, then new events are stored once, delivered per preference, resolved and cleaned up", async () => {
  const base = {
    subscriptions: [
      sub({ key: "netflix|EUR", name: "Netflix", priceChanges: [{ date: "2026-10-15", from: 14, to: 16 }] }),
      sub({ key: "claude|EUR", name: "Claude" }),
    ],
    pendingCharges: [charge("t1", "2026-10-03")],
  };
  const known = async () => new Set((await getState<string[]>(db, "state.knownSubscriptions")) ?? []);
  const input = async (now: string, over: Partial<NotificationSnapshot> = {}, s: Partial<Settings> = {}) => ({
    snapshot: snapshot({
      ...base,
      knownSubscriptions: (await getState<string[]>(db, "state.knownSubscriptions")) ? await known() : null,
      ...over,
    }),
    settings: settings({ emailRecipient: "me@example.com", ...s }),
    now: at(now),
    baseCurrency: "EUR",
  });
  const log: Sent[] = [];

  // An empty database doesn't count as the baseline.
  let r = await processNotifications(db, {
    ...(await input("2026-10-19T12:00:00Z", { subscriptions: [], pendingCharges: [] })),
    channels: [],
  });
  assert.equal(r.created, 0);
  assert.equal(await getState(db, "state.knownSubscriptions"), null);

  // Baseline: the price change is recorded silently, the subscriptions become "known".
  r = await processNotifications(db, { ...(await input("2026-10-19T12:00:00Z")), channels: fakeChannels(log) });
  assert.equal(r.created, 0);
  assert.deepEqual([...(await known())], ["claude|EUR", "netflix|EUR"]);
  assert.equal((await one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM notifications WHERE silent = 1"))?.n, 1);
  assert.equal(log.length, 0);

  // Reminder day (09:00 Vilnius) plus a brand-new subscription.
  const spotify = sub({ key: "spotify|EUR", name: "Spotify", ...fresh });
  r = await processNotifications(db, {
    ...(await input("2026-10-20T06:00:00Z", { subscriptions: [...base.subscriptions, spotify] })),
    channels: fakeChannels(log),
  });
  assert.equal(r.created, 2);
  // Reminder: push + immediate email. New subscription: no push, email only in the digest.
  assert.deepEqual(log.map((l) => `${l.kind}:${l.n.type}`).sort(), ["email:reimbursement_reminder", "push:reimbursement_reminder"]);
  assert.equal(log[0].n.tag, "reimburse:1:2026-10");
  assert.equal(r.pushed, 1);
  assert.equal(r.emailed, 1);

  // Running again changes nothing and sends nothing twice.
  r = await processNotifications(db, {
    ...(await input("2026-10-20T07:00:00Z", { subscriptions: [...base.subscriptions, spotify] })),
    channels: fakeChannels(log),
  });
  assert.deepEqual(r, { created: 0, resolved: 0, pushed: 0, emailed: 0, digest: null, deleted: 0 });
  assert.equal(log.length, 2);

  // The charge gets recorded: the reminder resolves.
  r = await processNotifications(db, {
    ...(await input("2026-10-20T08:00:00Z", { subscriptions: [...base.subscriptions, spotify], pendingCharges: [] })),
    channels: [],
  });
  assert.equal(r.resolved, 1);
  const reminder = await one<{ resolved_at: string | null; pushed_at: string | null }>(
    db,
    "SELECT resolved_at, pushed_at FROM notifications WHERE dedupe_key = 'reimburse:1:2026-10'",
  );
  assert.ok(reminder?.resolved_at && reminder.pushed_at);

  // Retention: 90 days later everything is gone.
  r = await processNotifications(db, { ...(await input("2027-01-25T12:00:00Z", { pendingCharges: [] })), channels: [] });
  assert.equal(r.deleted, 3);
});

test("runner: a failed delivery is retried by the next run; the digest goes out once per period", async () => {
  await run(db, "DELETE FROM notifications");
  await run(db, "DELETE FROM settings");
  const log: Sent[] = [];
  const digests: DigestInput[] = [];
  const lost = { ...session, status: "needs_reconnect" as const, lastError: "Revoked" };
  const input = (now: string) => ({
    snapshot: snapshot({ subscriptions: [sub({ key: "a|EUR" })], bankSessions: [lost], knownSubscriptions: new Set(["a|EUR"]) }),
    settings: settings(), // no email recipient: email isn't ready
    now: at(now),
    baseCurrency: "EUR",
  });
  let r = await processNotifications(db, { ...input("2026-10-05T06:00:00Z"), channels: fakeChannels(log, { failPush: true, digests }) });
  assert.equal(r.created, 1);
  assert.equal(r.pushed, 0);
  assert.equal(digests.length, 0); // email channel not ready → no digest
  assert.equal((await one<{ p: string | null }>(db, "SELECT pushed_at AS p FROM notifications"))?.p, null);

  r = await processNotifications(db, { ...input("2026-10-05T07:00:00Z"), channels: fakeChannels(log, { digests }) });
  assert.equal(r.pushed, 1);
  assert.equal(log.length, 1);

  // With a recipient: the weekly digest is sent, once.
  const withEmail = (now: string) => ({ ...input(now), settings: settings({ emailRecipient: "me@example.com" }) });
  r = await processNotifications(db, { ...withEmail("2026-10-05T08:00:00Z"), channels: fakeChannels(log, { digests }) });
  assert.equal(r.digest, "weekly:2026-10-05");
  assert.equal(digests.length, 1);
  assert.equal(digests[0].events.length, 0); // bank attention is an immediate email, not a digest item
  r = await processNotifications(db, { ...withEmail("2026-10-05T09:00:00Z"), channels: fakeChannels(log, { digests }) });
  assert.equal(r.digest, null);
  assert.equal(digests.length, 1);
  // Notifications already read in the app aren't pushed.
  await run(db, "UPDATE notifications SET read_at = ?, pushed_at = NULL", ["2026-10-05T09:30:00Z"]);
  r = await processNotifications(db, { ...withEmail("2026-10-05T10:00:00Z"), channels: fakeChannels(log, { digests }) });
  assert.equal(r.pushed, 0);
  const rows = await all<{ type: string }>(db, "SELECT type FROM notifications");
  assert.deepEqual(
    rows.map((x) => x.type),
    ["bank_attention"],
  );
});

test("runner: a failed first digest gives its slot back, so the next run sends it", async () => {
  await run(db, "DELETE FROM notifications");
  await run(db, "DELETE FROM settings");
  const digests: DigestInput[] = [];
  const input = (now: string) => ({
    snapshot: snapshot({ subscriptions: [sub({ key: "a|EUR" })], knownSubscriptions: new Set(["a|EUR"]) }),
    settings: settings({ emailRecipient: "me@example.com" }),
    now: at(now),
    baseCurrency: "EUR",
  });
  let r = await processNotifications(db, { ...input("2026-10-05T06:00:00Z"), channels: fakeChannels([], { failDigest: true, digests }) });
  assert.equal(r.digest, null);
  assert.equal(await getState(db, "state.lastDigest"), null);
  assert.equal(await one(db, "SELECT value FROM settings WHERE key = 'state.lastDigest'"), undefined);
  // Fails again: still retried.
  r = await processNotifications(db, { ...input("2026-10-05T07:00:00Z"), channels: fakeChannels([], { failDigest: true, digests }) });
  assert.equal(r.digest, null);
  r = await processNotifications(db, { ...input("2026-10-05T08:00:00Z"), channels: fakeChannels([], { digests }) });
  assert.equal(r.digest, "weekly:2026-10-05");
  assert.equal(digests.length, 1);
  assert.equal((await getState<{ key: string }>(db, "state.lastDigest"))?.key, "weekly:2026-10-05");
  // A later failure gives back the previous slot, not "missing": that period is still sent once.
  r = await processNotifications(db, { ...input("2026-10-12T06:00:00Z"), channels: fakeChannels([], { failDigest: true, digests }) });
  assert.equal((await getState<{ key: string }>(db, "state.lastDigest"))?.key, "weekly:2026-10-05");
  r = await processNotifications(db, { ...input("2026-10-12T07:00:00Z"), channels: fakeChannels([], { digests }) });
  assert.equal(r.digest, "weekly:2026-10-12");
  assert.equal(digests.length, 2);
  // Every run notes when it happened, for the catch-up rule.
  assert.equal(await getState(db, "state.lastRun"), "2026-10-12T07:00:00.000Z");
});
