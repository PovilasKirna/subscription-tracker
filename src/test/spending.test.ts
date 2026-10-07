import assert from "node:assert/strict";
import { test } from "node:test";
import type { CategoryId } from "../lib/categories";
import { autoCategory, categorizeAll, flowOf, salaryPayers } from "../lib/server/categorize";
import type { TxRow } from "../lib/server/db";
import { buildSpending, periodOf, shiftMonth } from "../lib/server/spending";
import type { Subscription } from "../lib/types";

let n = 0;
const tx = (date: string, amount: number, description: string, extra: Partial<TxRow> = {}): TxRow => ({
  id: `t${++n}`,
  source: "csv",
  account: "Current",
  date,
  amount_minor: Math.round(amount * 100),
  currency: "EUR",
  description,
  merchant_key: description.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  type: amount < 0 ? "CARD_PAYMENT" : "TOPUP",
  state: "COMPLETED",
  ...extra,
});
const none = { inSubscription: false, salary: new Set<string>() };
const round = (n: number) => Math.round(n * 100) / 100;

// ---------- categorising ----------

test("merchants, card codes and types land in the expected categories", () => {
  assert.equal(autoCategory(tx("2026-09-01", -20, "Lidl Vilnius"), none), "groceries");
  assert.equal(autoCategory(tx("2026-09-01", -12, "Bolt Food"), none), "restaurants", "food delivery, not a taxi");
  assert.equal(autoCategory(tx("2026-09-01", -8, "Bolt"), none), "transport");
  assert.equal(autoCategory(tx("2026-09-01", -30, "Some Shop", { mcc: "5411" }), none), "groceries", "MCC beats an unknown name");
  assert.equal(autoCategory(tx("2026-09-01", -30, "MAXIMA LT", { mcc: "5815" }), none), "groceries", "a known name beats a generic MCC");
  assert.equal(autoCategory(tx("2026-09-01", -50, "ATM", { type: "ATM" }), none), "cash");
  assert.equal(autoCategory(tx("2026-09-01", -5, "Premium plan fee", { type: "FEE" }), none), "fees");
  assert.equal(autoCategory(tx("2026-09-01", -100, "Exchanged to USD", { type: "EXCHANGE" }), none), "internal");
  assert.equal(autoCategory(tx("2026-09-01", -200, "To EUR Savings", { type: "TRANSFER" }), none), "savings");
  assert.equal(autoCategory(tx("2026-09-01", 50, "From Holiday pocket", { type: "TRANSFER" }), none), "savings");
  assert.equal(
    autoCategory(tx("2026-09-01", 200, "From EUR Current", { type: "TRANSFER", account: "Savings" }), none),
    "internal",
    "the savings account's side of the same move isn't counted twice",
  );
  assert.equal(autoCategory(tx("2026-09-01", 100, "Top-up by *1234"), none), "internal");
  assert.equal(autoCategory(tx("2026-09-01", 15, "Amazon", { type: "CARD_REFUND" }), none), "refunds");
  assert.equal(autoCategory(tx("2026-09-01", -60, "Jonas Jonaitis", { type: "TRANSFER" }), none), "transfers");
  assert.equal(autoCategory(tx("2026-09-01", -9.99, "Netflix"), { ...none, inSubscription: true }), "subscriptions");
  assert.equal(autoCategory(tx("2026-09-01", -3, "Mystery Ltd"), none), "general");
  // Not fooled by words containing a keyword.
  assert.equal(autoCategory(tx("2026-09-01", -3, "Student union"), none), "general");
  assert.equal(autoCategory(tx("2026-09-01", -3, "Current account thing"), none), "general");
});

test("regular sizeable money from the same payer is salary; one-offs are other income", () => {
  const txs = [
    tx("2026-07-25", 2400, "Darbdavys UAB"),
    tx("2026-08-25", 2400, "Darbdavys UAB"),
    tx("2026-09-25", 2450, "Darbdavys UAB"),
    tx("2026-09-10", 50, "Mama"),
    tx("2026-08-10", 50, "Mama"),
    tx("2026-07-10", 50, "Mama"),
  ];
  assert.deepEqual([...salaryPayers(txs)], ["darbdavys-uab"]);
  const cats = categorizeAll(txs, new Map(), { byTx: new Map(), byMerchant: new Map() });
  assert.equal(cats.get(txs[0].id), "salary");
  assert.equal(cats.get(txs[3].id), "income", "too small to be a salary");
});

test("a payment's own choice beats its merchant's rule, which beats the automatic one", () => {
  const a = tx("2026-09-01", -10, "Lidl Vilnius");
  const b = tx("2026-09-02", -10, "Lidl Vilnius");
  const cats = categorizeAll([a, b], new Map(), {
    byTx: new Map<string, CategoryId>([[a.id, "health"]]),
    byMerchant: new Map<string, CategoryId>([["lidl-vilnius", "shopping"]]),
  });
  assert.equal(cats.get(a.id), "health");
  assert.equal(cats.get(b.id), "shopping");
});

test("spending adds money out and subtracts refunds; savings count as saved; internal moves count for nothing", () => {
  assert.deepEqual(flowOf({ amount_minor: -1000 }, "spend"), { spent: 1000, earned: 0, saved: 0 });
  assert.deepEqual(flowOf({ amount_minor: 300 }, "spend"), { spent: -300, earned: 0, saved: 0 }, "a refund");
  assert.deepEqual(flowOf({ amount_minor: 240000 }, "income"), { spent: 0, earned: 240000, saved: 0 });
  assert.deepEqual(flowOf({ amount_minor: -20000 }, "savings"), { spent: 0, earned: 0, saved: 20000 });
  assert.deepEqual(flowOf({ amount_minor: 5000 }, "savings"), { spent: 0, earned: 0, saved: -5000 }, "taken back out");
  assert.deepEqual(flowOf({ amount_minor: -50000 }, "internal"), { spent: 0, earned: 0, saved: 0 });
});

// ---------- the Spending page ----------

const sub = (over: Partial<Subscription>): Subscription =>
  ({ status: "active", currency: "EUR", cadence: "monthly", ...over }) as Subscription;

test("a month's totals, categories, running total and comparison with the month before", () => {
  const txs = [
    tx("2026-08-03", -100, "Lidl Vilnius"),
    tx("2026-08-20", -50, "Lidl Vilnius"),
    tx("2026-08-25", 2000, "Darbdavys"),
    tx("2026-09-02", -40, "Lidl Vilnius"),
    tx("2026-09-05", -60, "Wolt"),
    tx("2026-09-06", 10, "Wolt", { type: "CARD_REFUND" }),
    tx("2026-09-07", -500, "To EUR Savings", { type: "TRANSFER" }),
    tx("2026-09-25", 2000, "Darbdavys"),
    tx("2026-09-26", -7, "Pret", { currency: "GBP" }),
  ];
  const categoryOf = categorizeAll(txs, new Map(), { byTx: new Map(), byMerchant: new Map() });
  const s = buildSpending({ txs, categoryOf, subscriptions: [], base: "EUR", range: "1m", at: "2026-09", today: "2026-10-07" });
  assert.deepEqual(s.period, { start: "2026-09-01", end: "2026-09-30", unit: "day", cutoff: "2026-09-30" });
  assert.equal(s.isCurrent, false);
  assert.equal(s.canGoBack, true);
  assert.equal(s.spent, 90, "40 + 60 − 10 refund; the savings transfer isn't spending");
  assert.equal(s.previousComparable, 150, "a past month compares with the whole month before");
  assert.equal(s.income.total, 2000);
  assert.equal(s.cashflow, 1910);
  assert.deepEqual(
    s.categories.map((c) => [c.id, c.amount]),
    [
      ["restaurants", 60],
      ["groceries", 40],
      ["refunds", -10],
    ],
  );
  assert.equal(s.points.length, 30);
  assert.equal(s.points[1].spent, 40);
  assert.equal(s.points[1].amount, 40, "the bar for the 2nd");
  assert.equal(s.points[29].spent, 90);
  assert.equal(s.points[29].previous, 150);
  assert.equal(s.previousTotal, 150);
  assert.ok(
    s.points.every((d) => d.projected === null),
    "no projection for a finished month",
  );
  assert.deepEqual(s.otherCurrencies, ["GBP"]);
});

test("a recurring transfer filed under Savings isn't projected as spending", () => {
  const txs = [
    tx("2026-09-25", -300, "To Emergency Fund", { type: "TRANSFER" }),
    tx("2026-09-12", -10, "Netflix.com"),
    tx("2026-10-02", -20, "Lidl Vilnius"),
  ];
  const [fund, netflix] = txs;
  const txToSub = new Map([
    [fund.id, "to-emergency-fund|EUR"],
    [netflix.id, "netflix|EUR"],
  ]);
  const categoryOf = categorizeAll(txs, txToSub, { byTx: new Map(), byMerchant: new Map([[fund.merchant_key, "savings"]]) });
  const subscriptions = [
    sub({ key: "to-emergency-fund|EUR", name: "Emergency fund", amount: 300, nextCharge: "2026-10-25" }),
    sub({ key: "netflix|EUR", name: "Netflix", amount: 10, nextCharge: "2026-10-12" }),
  ];
  const s = buildSpending({ txs, txToSub, categoryOf, subscriptions, base: "EUR", range: "1m", at: "", today: "2026-10-10" });
  assert.equal(s.upcomingSubscriptions, 10, "only Netflix is still to be spent");
  assert.equal(s.points[24].projectedAmount ?? 0, 0, "nothing expected on the fund's day");
  assert.equal(s.points[11].projectedAmount, 10);
});

test("the current month compares with the same day last month and projects to month end", () => {
  const txs = [
    // Three finished months of 310 a month of day-to-day spending (10/day in 31-day months).
    ...["2026-07", "2026-08", "2026-09"].map((m) => tx(`${m}-15`, m === "2026-09" ? -300 : -310, "Lidl Vilnius")),
    tx("2026-09-05", -20, "Lidl Vilnius"),
    tx("2026-10-03", -50, "Lidl Vilnius"),
  ];
  const categoryOf = categorizeAll(txs, new Map(), { byTx: new Map(), byMerchant: new Map() });
  const subscriptions = [sub({ key: "netflix|EUR", name: "Netflix", amount: 10, nextCharge: "2026-10-20" })];
  const s = buildSpending({ txs, categoryOf, subscriptions, base: "EUR", range: "1m", at: "", today: "2026-10-10" });
  assert.equal(s.period.start, "2026-10-01");
  assert.equal(s.period.cutoff, "2026-10-10");
  assert.equal(s.isCurrent, true);
  assert.equal(s.spent, 50);
  assert.equal(s.previousComparable, 20, "September up to the 10th");
  assert.equal(s.upcomingSubscriptions, 10);
  // The last three months each spent ~300 on the 15th (still ahead), so that's expected again, plus
  // Netflix on the 20th. The 20 spent on 5 September is already behind us and isn't projected.
  assert.equal(s.projected, 50 + 306.67 + 10);
  assert.equal(s.points[9].spent, 50, "today");
  assert.equal(s.points[10].spent, null, "nothing drawn after today");
  assert.equal(s.points[9].projected, 50, "the projection starts at today's total");
  assert.equal(s.points[30].projected, s.projected);
  assert.equal(s.points[14].projectedAmount, 306.67, "the expected bar for the 15th");
  // Not a straight line: it rises on the days money usually goes out.
  const step = (day: number) => round((s.points[day - 1].projected ?? 0) - (s.points[day - 2].projected ?? 0));
  assert.equal(step(12), 0);
  assert.equal(step(15), 306.67);
  assert.equal(step(20), 10);
});

test("a week runs Monday to Sunday and compares with the week before", () => {
  const txs = [
    tx("2026-09-28", -30, "Lidl Vilnius"), // Monday the week before
    tx("2026-10-05", -20, "Lidl Vilnius"), // Monday
    tx("2026-10-07", -15, "Wolt"), // Wednesday (today)
  ];
  const categoryOf = categorizeAll(txs, new Map(), { byTx: new Map(), byMerchant: new Map() });
  const s = buildSpending({ txs, categoryOf, subscriptions: [], base: "EUR", range: "1w", at: "", today: "2026-10-07" });
  assert.deepEqual([s.period.start, s.period.end], ["2026-10-05", "2026-10-11"]);
  assert.equal(s.spent, 35);
  assert.equal(s.previousComparable, 30, "last week up to Wednesday");
  assert.deepEqual(
    s.points.map((p) => p.spent),
    [20, 20, 35, null, null, null, null],
  );
  // No earlier months to learn from here, so only what's been spent is projected.
  assert.equal(s.projected, 35);
  assert.equal(s.points[6].projected, 35);
});

test("6 months add up by month against the 6 before", () => {
  const txs = [tx("2026-03-10", -100, "Lidl Vilnius"), tx("2026-05-10", -40, "Lidl Vilnius"), tx("2026-10-02", -60, "Wolt")];
  const categoryOf = categorizeAll(txs, new Map(), { byTx: new Map(), byMerchant: new Map() });
  const s = buildSpending({ txs, categoryOf, subscriptions: [], base: "EUR", range: "6m", at: "", today: "2026-10-07" });
  assert.deepEqual(
    s.points.map((p) => p.key),
    ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
  );
  assert.deepEqual(
    s.points.map((p) => p.amount),
    [40, 0, 0, 0, 0, 60],
  );
  assert.equal(s.spent, 100);
  assert.equal(s.previousTotal, 100, "November to April");
  assert.equal(s.points[0].previousAmount, 0, "November");
  assert.equal(s.points[4].previousAmount, 100, "March lines up with September");
});

test("periods: a past `at` picks its period; a future one falls back to now", () => {
  assert.deepEqual(periodOf("1w", "2026-10-11"), periodOf("1w", "2026-10-05"));
  assert.deepEqual(
    [periodOf("1y", "2026-10-15").start, periodOf("1y", "2026-10-15").end],
    ["2026-01-01", "2026-12-31"],
    "a calendar year, not the last 12 months",
  );
  assert.equal(periodOf("1m", "2024-02-10").end, "2024-02-29");
  const s = buildSpending({
    txs: [],
    categoryOf: new Map(),
    subscriptions: [],
    base: "EUR",
    range: "1m",
    at: "2027-01",
    today: "2026-10-07",
  });
  assert.equal(s.period.start, "2026-10-01");
  assert.equal(s.canGoBack, false, "nothing before without data");
});

test("a year runs January to December against last year and is projected to December", () => {
  const txs = [
    tx("2025-03-10", -100, "Lidl Vilnius"),
    tx("2025-11-10", -50, "Lidl Vilnius"),
    // July–September: 300 a month, so a usual month is 300.
    ...["2026-07", "2026-08", "2026-09"].map((m) => tx(`${m}-10`, -300, "Lidl Vilnius")),
    tx("2026-10-02", -80, "Wolt"),
  ];
  const categoryOf = categorizeAll(txs, new Map(), { byTx: new Map(), byMerchant: new Map() });
  const s = buildSpending({ txs, categoryOf, subscriptions: [], base: "EUR", range: "1y", at: "", today: "2026-10-07" });
  assert.equal(s.points.length, 12);
  assert.equal(s.points[0].key, "2026-01");
  assert.equal(s.spent, 980);
  assert.equal(s.previousComparable, 100, "2025 up to October");
  assert.equal(s.previousTotal, 150);
  assert.equal(s.points[9].spent, 980, "October so far");
  assert.equal(s.points[10].spent, null, "November hasn't happened yet");
  assert.equal(s.points[10].previous, 150, "last year's line runs to December");
  // October's remaining days (300 on the 10th, as usual) + a usual 300 for November and December.
  assert.equal(s.points[10].projected, 980 + 300 + 300);
  assert.equal(s.projected, 980 + 300 + 300 + 300);
  assert.equal(s.points[11].projectedAmount, 300);
});

test("an impossible date falls back to the current period instead of failing", () => {
  for (const at of ["2026-00", "2026-13-01", "2026-02-30", "garbage"]) {
    const s = buildSpending({ txs: [], categoryOf: new Map(), subscriptions: [], base: "EUR", range: "1m", at, today: "2026-10-07" });
    assert.equal(s.period.start, "2026-10-01", at);
  }
});

test("on the 31st, a month compares with all of the shorter month before", () => {
  const txs = [tx("2026-09-30", -100, "Lidl Vilnius"), tx("2026-10-31", -40, "Lidl Vilnius")];
  const categoryOf = categorizeAll(txs, new Map(), { byTx: new Map(), byMerchant: new Map() });
  const s = buildSpending({ txs, categoryOf, subscriptions: [], base: "EUR", range: "1m", at: "", today: "2026-10-31" });
  assert.equal(s.previousComparable, 100, "September up to its last day, not zero");
});

test("6 months compare with the same day 6 months before, not the whole aligned month", () => {
  const txs = [
    tx("2026-04-05", -30, "Lidl Vilnius"), // within the comparison (up to 7 April)
    tx("2026-04-20", -70, "Lidl Vilnius"), // after the same day 6 months earlier
    tx("2026-10-02", -50, "Lidl Vilnius"),
  ];
  const categoryOf = categorizeAll(txs, new Map(), { byTx: new Map(), byMerchant: new Map() });
  const s = buildSpending({ txs, categoryOf, subscriptions: [], base: "EUR", range: "6m", at: "", today: "2026-10-07" });
  assert.equal(s.previousComparable, 30);
  assert.equal(s.previousTotal, 100);
});

test("a subscription relabelled by the user is still projected once, on its due day", () => {
  // Rent is a detected subscription the user moved to Housing: it must not also count as usual spending.
  const rent = (m: string) => tx(`${m}-03`, -650, "Rent landlord", { type: "TRANSFER" });
  const txs = [...["2026-07", "2026-08", "2026-09"].map(rent), tx("2026-10-03", -650, "Rent landlord", { type: "TRANSFER" })];
  const txToSub = new Map(txs.map((t) => [t.id, "rent-landlord|EUR"]));
  const categoryOf = categorizeAll(txs, txToSub, {
    byTx: new Map(),
    byMerchant: new Map<string, CategoryId>([["rent-landlord", "housing"]]),
  });
  const subscriptions = [sub({ key: "rent-landlord|EUR", name: "Rent", amount: 650, nextCharge: "2026-11-03" })];
  // Looking at the 2nd: rent on the 3rd is due once (as the subscription), not twice.
  const s = buildSpending({ txs, txToSub, categoryOf, subscriptions, base: "EUR", range: "1m", at: "", today: "2026-10-02" });
  assert.equal(s.projected, 0);
  const before = buildSpending({
    txs: txs.slice(0, 3),
    txToSub,
    categoryOf,
    subscriptions: [sub({ key: "rent-landlord|EUR", name: "Rent", amount: 650, nextCharge: "2026-10-03" })],
    base: "EUR",
    range: "1m",
    at: "",
    today: "2026-10-02",
  });
  assert.equal(before.projected, 650);
});

test("months shift across years", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2025-12", 1), "2026-01");
});
