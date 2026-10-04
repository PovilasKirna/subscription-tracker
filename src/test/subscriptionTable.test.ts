import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSubscriptionParams, serializeSubscriptionParams } from "../lib/search-params";
import { querySubscriptions } from "../lib/server/subscriptionTable";
import type { Cadence, SubStatus, Subscription } from "../lib/types";

const sub = (
  name: string,
  { status = "active", cadence = "monthly", category = "Streaming", amount = 10, nextCharge = "2026-07-01" as string | null } = {} as {
    status?: SubStatus;
    cadence?: Cadence;
    category?: string;
    amount?: number;
    nextCharge?: string | null;
  },
): Subscription => {
  const merchantKey = name.toLowerCase().replace(/\s+/g, "");
  return {
    key: `${merchantKey}|EUR`,
    merchantKey,
    name,
    category,
    currency: "EUR",
    cadence,
    periodDays: 30,
    amount,
    monthlyCost: amount,
    yearlyCost: amount * 12,
    firstCharge: "2025-01-01",
    lastCharge: "2026-06-01",
    nextCharge,
    chargeCount: 18,
    totalSpent: amount * 18,
    status,
    confidence: 0.9,
    confirmed: false,
    pinned: false,
    known: true,
    color: null,
    colorChosen: false,
    priceChanges: [],
    charges: Array.from({ length: 18 }, (_, i) => ({ date: `2025-${String((i % 12) + 1).padStart(2, "0")}-01`, amount })),
  };
};

const det = {
  today: "2026-06-20",
  subscriptions: [
    sub("Netflix", { amount: 15.99, nextCharge: "2026-07-05" }),
    sub("Spotify", { category: "Music & audio", amount: 11.99, nextCharge: null, status: "inactive" }),
    sub("Gym", { category: "Fitness", amount: 30, nextCharge: "2026-06-25", status: "late" }),
    sub("iCloud", { category: "Cloud storage", amount: 2.99, nextCharge: "2026-06-28" }),
    sub("Adobe", { category: "Software & AI", cadence: "yearly", amount: 240, nextCharge: "2026-12-01", status: "cancelled" }),
  ],
  ignored: [sub("Lidl", { category: "Other", amount: 40, nextCharge: "2026-06-30" })],
};
const params = (qs = "") => loadSubscriptionParams(new URLSearchParams(qs));
const names = (r: ReturnType<typeof querySubscriptions>) => r.items.map((i) => i.name);

test("subscriptions table: default sort is by status, ignored rows hidden, ties stable", () => {
  const r = querySubscriptions(det, params());
  assert.deepEqual(names(r), ["Netflix", "iCloud", "Gym", "Spotify", "Adobe"]);
  assert.equal(r.total, 5);
  assert.equal(r.detected, 5);
  assert.equal(r.page, 1);
  assert.equal(r.pageCount, 1);
  assert.ok(r.items.every((i) => i.rowStatus !== "ignored"));
});

test("subscriptions table: ignored rows appear only when that status is filtered for", () => {
  const ignored = querySubscriptions(det, params("status=ignored"));
  assert.deepEqual(names(ignored), ["Lidl"]);
  assert.equal(ignored.items[0].rowStatus, "ignored");
  const both = querySubscriptions(det, params("status=active,ignored"));
  assert.deepEqual(names(both), ["Netflix", "iCloud", "Lidl"]);
});

test("subscriptions table: faceted counts ignore their own dimension and include ignored statuses", () => {
  const r = querySubscriptions(det, params("status=active&cadence=monthly"));
  assert.deepEqual(r.facets.status, { active: 2, late: 1, inactive: 1, ignored: 1 });
  assert.deepEqual(r.facets.cadence, { monthly: 2 });
  assert.deepEqual(r.facets.category, { Streaming: 1, "Cloud storage": 1 });
  // Without a status filter, other facets count only what would be shown (ignored rows are hidden).
  const all = querySubscriptions(det, params());
  assert.deepEqual(all.facets.cadence, { monthly: 4, yearly: 1 });
  assert.equal(all.facets.category.Other, undefined);
  assert.equal(all.facets.status.ignored, 1);
});

test("subscriptions table: categories list every category in use, independent of filters", () => {
  const r = querySubscriptions(det, params("q=netflix&category=Streaming"));
  assert.deepEqual(r.categories, ["Cloud storage", "Fitness", "Music & audio", "Other", "Software & AI", "Streaming"]);
});

test("subscriptions table: search matches name, merchant key and category", () => {
  assert.deepEqual(names(querySubscriptions(det, params("q=NETF"))), ["Netflix"]);
  assert.deepEqual(names(querySubscriptions(det, params("q=icloud"))), ["iCloud"]);
  assert.deepEqual(names(querySubscriptions(det, params("q=music"))), ["Spotify"]);
  // Search applies to ignored rows too, when they're shown.
  assert.deepEqual(names(querySubscriptions(det, params("q=lidl&status=ignored"))), ["Lidl"]);
  assert.equal(querySubscriptions(det, params("q=lidl")).total, 0);
});

test("subscriptions table: sorting by name, amount and next charge (nulls last both ways)", () => {
  assert.deepEqual(names(querySubscriptions(det, params("sort=name"))), ["Adobe", "Gym", "iCloud", "Netflix", "Spotify"]);
  assert.deepEqual(names(querySubscriptions(det, params("sort=amount&dir=desc"))), ["Adobe", "Gym", "Netflix", "Spotify", "iCloud"]);
  assert.deepEqual(names(querySubscriptions(det, params("sort=monthlyCost"))), ["iCloud", "Spotify", "Netflix", "Gym", "Adobe"]);
  assert.deepEqual(names(querySubscriptions(det, params("sort=nextCharge"))), ["Gym", "iCloud", "Netflix", "Adobe", "Spotify"]);
  assert.deepEqual(names(querySubscriptions(det, params("sort=nextCharge&dir=desc"))), ["Adobe", "Netflix", "iCloud", "Gym", "Spotify"]);
  assert.deepEqual(names(querySubscriptions(det, params("sort=status&dir=desc"))), ["Adobe", "Spotify", "Gym", "Netflix", "iCloud"]);
});

test("subscriptions table: paginates and clamps out-of-range pages", () => {
  const p2 = querySubscriptions(det, { ...params(), perPage: 10, page: 1 });
  assert.equal(p2.pageCount, 1);
  const many = {
    today: det.today,
    subscriptions: Array.from({ length: 23 }, (_, i) => sub(`Service ${String(i).padStart(2, "0")}`)),
    ignored: [],
  };
  const page3 = querySubscriptions(many, params("perPage=10&page=3&sort=name"));
  assert.equal(page3.pageCount, 3);
  assert.equal(page3.page, 3);
  assert.deepEqual(names(page3), ["Service 20", "Service 21", "Service 22"]);
  assert.equal(querySubscriptions(many, params("perPage=10&page=99")).page, 3);
  assert.equal(querySubscriptions(many, params("page=-4")).page, 1);
});

test("subscriptions table: rows carry only the charges the sparkline shows", () => {
  const r = querySubscriptions(det, params());
  assert.ok(r.items.every((i) => i.charges.length === 12));
  assert.equal(det.subscriptions[0].charges.length, 18, "input is not mutated");
});

test("subscription params: invalid values fall back to defaults and serialise round-trip", () => {
  const p = params("perPage=7&sort=nope&dir=up&status=active,bogus&cadence=daily");
  assert.equal(p.perPage, 25);
  assert.equal(p.sort, "status");
  assert.equal(p.dir, "asc");
  assert.deepEqual(p.cadence, []);
  const f = params("q=net&status=late,ignored&category=Fitness&sort=amount&dir=desc&page=2&perPage=50");
  assert.deepEqual(loadSubscriptionParams(new URLSearchParams(serializeSubscriptionParams(f))), f);
});
