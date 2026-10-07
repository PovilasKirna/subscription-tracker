import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type CategoryEdit,
  categorizeDetail,
  categorizeItem,
  categorizeTransactions,
  overrideShownAtOnce,
  overrideSubscriptions,
  overrideTable,
} from "../lib/query/optimistic";
import type {
  Subscription,
  SubscriptionDetailPayload,
  SubscriptionRow,
  SubscriptionsTablePayload,
  TransactionItem,
  TransactionsPayload,
} from "../lib/types";

const tx = (id: string, merchantKey: string, patch: Partial<TransactionItem> = {}): TransactionItem => ({
  id,
  date: "2026-10-01",
  description: merchantKey,
  merchantKey,
  website: null,
  amount: -10,
  currency: "EUR",
  type: "CARD_PAYMENT",
  source: "csv",
  subscriptionKey: null,
  category: "general",
  categoryChosen: null,
  ...patch,
});

const page = (items: TransactionItem[]): TransactionsPayload => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 50,
  pageCount: 1,
  facets: { flow: {}, type: {}, source: {}, sub: {}, category: {} },
});

const edit = (patch: Partial<CategoryEdit>): CategoryEdit => ({
  txId: "a",
  merchantKey: "lidl",
  scope: "payment",
  category: "groceries",
  ...patch,
});

test("a payment's own category changes only that payment", () => {
  const data = page([tx("a", "lidl"), tx("b", "lidl")]);
  const next = categorizeTransactions(data, edit({}));
  assert.deepEqual(
    next.items.map((t) => [t.id, t.category, t.categoryChosen]),
    [
      ["a", "groceries", "payment"],
      ["b", "general", null],
    ],
  );
  assert.equal(next.items[1], data.items[1], "untouched rows keep their identity");
});

test("a merchant's category covers its payments, except those picked one by one", () => {
  const data = page([
    tx("a", "lidl"),
    tx("b", "lidl"),
    tx("c", "lidl", { category: "shopping", categoryChosen: "payment" }),
    tx("d", "rimi"),
  ]);
  const next = categorizeTransactions(data, edit({ scope: "merchant" }));
  assert.deepEqual(
    next.items.map((t) => [t.id, t.category, t.categoryChosen]),
    [
      ["a", "groceries", "merchant"],
      ["b", "groceries", "merchant"],
      ["c", "shopping", "payment"],
      ["d", "general", null],
    ],
  );
  // The edited payment itself always follows the merchant (the server drops its own pick).
  const own = categorizeItem(tx("a", "lidl", { category: "shopping", categoryChosen: "payment" }), edit({ scope: "merchant" }));
  assert.deepEqual([own.category, own.categoryChosen], ["groceries", "merchant"]);
});

test("back to automatic and no-op edits leave the data as it is", () => {
  const data = page([tx("a", "lidl", { category: "groceries", categoryChosen: "payment" })]);
  assert.equal(categorizeTransactions(data, edit({ category: null })), data, "detection decides the automatic category");
  assert.equal(categorizeTransactions(data, edit({})), data, "already that category");
  assert.equal(categorizeTransactions(data, edit({ txId: "zzz", merchantKey: "zzz" })), data, "not on this page");
});

test("the subscription drawer's charge lists are categorised too", () => {
  const detail = {
    transactions: [tx("a", "lidl")],
    excluded: [tx("b", "lidl")],
    related: [{ ...tx("c", "lidl"), similar: false, subscriptionName: null }],
  } as SubscriptionDetailPayload;
  const next = categorizeDetail(detail, edit({ scope: "merchant" }));
  assert.deepEqual(
    [next.transactions[0].category, next.excluded[0].category, next.related[0].category, next.related[0].similar],
    ["groceries", "groceries", "groceries", false],
  );
});

const sub = (key: string, patch: Partial<Subscription> = {}) =>
  ({ key, name: key, category: "Other", group: null, website: null, websiteChosen: false, ...patch }) as Subscription;

test("a subscription's name, category, logo and group show at once", () => {
  const data = { baseCurrency: "EUR", today: "2026-10-07", subscriptions: [sub("netflix|EUR"), sub("spotify|EUR")], ignored: [] };
  const next = overrideSubscriptions(data, {
    key: "netflix|EUR",
    displayName: "Netflix 4K",
    category: "Streaming",
    website: "netflix.com",
    group: "TV",
  });
  assert.deepEqual(
    (({ name, category, website, websiteChosen, group }) => ({ name, category, website, websiteChosen, group }))(next.subscriptions[0]),
    { name: "Netflix 4K", category: "Streaming", website: "netflix.com", websiteChosen: true, group: "TV" },
  );
  assert.equal(next.subscriptions[1], data.subscriptions[1]);
  assert.equal(next.ignored, data.ignored);
  // Leaving a group ("" or null) is known; clearing a name or logo isn't (detection's value comes back).
  const grouped = { ...data, subscriptions: [sub("netflix|EUR", { group: "TV" })] };
  assert.equal(overrideSubscriptions(grouped, { key: "netflix|EUR", group: "" }).subscriptions[0].group, null);
  assert.equal(overrideSubscriptions(data, { key: "netflix|EUR", displayName: null, website: "" }), data);
});

test("table rows inside a group are patched", () => {
  const member = { ...sub("netflix|EUR"), rowStatus: "active" } as SubscriptionRow;
  const group = { ...sub("group:TV|EUR"), rowStatus: "active", members: [member] } as SubscriptionRow;
  const data = { items: [group] } as SubscriptionsTablePayload;
  const next = overrideTable(data, { key: "netflix|EUR", category: "Streaming" });
  assert.equal(next.items[0].members?.[0].category, "Streaming");
  assert.equal(next.items[0].category, "Other", "the group's own row is rebuilt by the refetch");
});

test("only edits the patch can show skip waiting for detection", () => {
  assert.ok(overrideShownAtOnce({ key: "k", category: "Streaming" }));
  assert.ok(overrideShownAtOnce({ key: "k", displayName: "Netflix", group: null }));
  assert.ok(!overrideShownAtOnce({ key: "k", displayName: null }), "back to the detected name");
  assert.ok(!overrideShownAtOnce({ key: "k", website: "" }), "back to the built-in logo");
  assert.ok(!overrideShownAtOnce({ key: "k", status: "cancelled" } as { key: string }), "status moves it between lists");
  assert.ok(!overrideShownAtOnce({ key: "k", cadence: "yearly" } as { key: string }), "cadence changes its costs");
});
