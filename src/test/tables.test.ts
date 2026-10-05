import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoader } from "nuqs/server";
import { applyFilters, countFacets, type FilterDef } from "../components/data-table/filters";
import { clientPerPageParam, effectivePageSize, loadTransactionParams, PAGE_SIZES, PHONE_PAGE_SIZE } from "../lib/search-params";
import type { TxRow } from "../lib/server/db";
import { detectSubscriptions } from "../lib/server/detect";
import { merchantKey } from "../lib/server/merchant";
import { queryTransactions } from "../lib/server/transactionTable";

let n = 0;
const tx = (
  date: string,
  amount: number,
  description: string,
  type: string | null = "CARD_PAYMENT",
  source: "csv" | "bank" = "csv",
): TxRow => ({
  id: `t${n++}`,
  source,
  account: "Current",
  date,
  amount_minor: Math.round(amount * 100),
  currency: "EUR",
  description,
  merchant_key: merchantKey(description),
  type,
  state: "COMPLETED",
});
const params = (qs = "") => loadTransactionParams(new URLSearchParams(qs));
const loadClient = createLoader({ perPage: clientPerPageParam });

const rows = [
  tx("2026-01-05", -15.99, "Netflix.com"),
  tx("2026-02-05", -15.99, "Netflix.com"),
  tx("2026-01-10", 2400, "Payment from Employer", "TOPUP"),
  tx("2026-01-12", -50, "To Landlord", "TRANSFER", "bank"),
  tx("2026-01-20", -12.3, "Maxima LT", null, "bank"),
];
const subs = new Map([
  [rows[0].id, "netflix|EUR"],
  [rows[1].id, "netflix|EUR"],
]);

test("server table: defaults sort by date desc and paginate", () => {
  const r = queryTransactions(rows, subs, params("perPage=10"));
  assert.equal(r.total, 5);
  assert.equal(r.items[0].date, "2026-02-05");
  assert.equal(r.pageCount, 1);
  const p2 = queryTransactions(rows, subs, { ...params(), perPage: 10, page: 9 });
  assert.equal(p2.page, 1, "out-of-range pages clamp");
});

test("server table: amount sign, subscription and type filters with faceted counts", () => {
  const out = queryTransactions(rows, subs, params("flow=out"));
  assert.equal(out.total, 4);
  assert.deepEqual(out.facets.flow, { in: 1, out: 4 }, "a facet's counts ignore its own selection");
  const subOnly = queryTransactions(rows, subs, params("flow=out&sub=subscription"));
  assert.equal(subOnly.total, 2);
  assert.ok(subOnly.items.every((i) => i.subscriptionKey === "netflix|EUR"));
  const unknownType = queryTransactions(rows, subs, params("type=UNKNOWN"));
  assert.deepEqual(
    unknownType.items.map((i) => i.description),
    ["Maxima LT"],
  );
  const multi = queryTransactions(rows, subs, params("type=TOPUP,TRANSFER"));
  assert.equal(multi.total, 2);
});

test("server table: sorting by amount ascending and search", () => {
  const byAmount = queryTransactions(rows, subs, params("sort=amount&dir=asc"));
  assert.equal(byAmount.items[0].amount, -50);
  const search = queryTransactions(rows, subs, params("q=netflix"));
  assert.equal(search.total, 2);
});

test("invalid URL values fall back to defaults", () => {
  const p = params("perPage=7&sort=nope&dir=sideways&flow=up");
  assert.equal(p.perPage, 25);
  assert.equal(p.sort, "date");
  assert.equal(p.dir, "desc");
});

test("excluded charges are removed from a subscription", () => {
  const monthly = Array.from({ length: 6 }, (_, i) => tx(`2026-0${i + 1}-03`, -20, "To Savings Card"));
  const oneOff = tx("2026-03-15", -900, "To Savings Card");
  const all = [...monthly, oneOff];
  const withOutlier = detectSubscriptions(all, new Map(), "2026-06-20");
  const excluded = detectSubscriptions(all, new Map(), "2026-06-20", "EUR", new Set([oneOff.id]));
  assert.ok(excluded.subscriptions.length === 1);
  assert.equal(excluded.subscriptions[0].amount, 20);
  assert.equal(excluded.subscriptions[0].chargeCount, 6);
  assert.ok(!excluded.txToSub.has(oneOff.id));
  // Without the exclusion the outlier is part of the merchant's charges if detected at all.
  const sub = withOutlier.subscriptions[0];
  if (sub) assert.ok(sub.charges.some((c) => c.amount === 900) || !withOutlier.txToSub.has(oneOff.id));
});

test("client table helpers filter and count facets", () => {
  type Row = { kind: string; size: string };
  const defs: FilterDef<Row>[] = [
    { key: "kind", label: "Kind", noun: "kinds", icon: (() => null) as never, options: [], accessor: (r) => r.kind },
    { key: "size", label: "Size", noun: "sizes", icon: (() => null) as never, options: [], accessor: (r) => r.size },
  ];
  const data: Row[] = [
    { kind: "a", size: "s" },
    { kind: "a", size: "l" },
    { kind: "b", size: "s" },
  ];
  assert.equal(applyFilters(data, defs, { kind: ["a"] }).length, 2);
  assert.equal(applyFilters(data, defs, { kind: ["a"], size: ["s"] }).length, 1);
  const facets = countFacets(data, defs, { kind: ["a"] });
  assert.deepEqual(facets.kind, { a: 2, b: 1 });
  assert.deepEqual(facets.size, { s: 1, l: 1 });
});

test("page size: an explicit ?perPage wins, otherwise phones get 10 and everything else 25", () => {
  assert.equal(effectivePageSize(null, false), 25);
  assert.equal(effectivePageSize(null, true), 10);
  assert.equal(effectivePageSize(50, true), 50);
  assert.equal(effectivePageSize(25, true), 25);
  assert.equal(effectivePageSize(10, false), 10);
  assert.ok(PAGE_SIZES.includes(PHONE_PAGE_SIZE));
});

test("the client perPage param has no default, so an absent one reads as null", () => {
  const { perPage } = loadClient(new URLSearchParams(""));
  assert.equal(perPage, null);
  assert.equal(loadClient(new URLSearchParams("perPage=50")).perPage, 50);
  assert.equal(loadClient(new URLSearchParams("perPage=7")).perPage, null);
  // The server loader still defaults to 25 so prefetch and desktop agree.
  assert.equal(loadTransactionParams(new URLSearchParams("")).perPage, 25);
});
