import assert from "node:assert/strict";
import { test } from "node:test";
import { planAssignment, planSplit, plansOverlap, pricePlans } from "../lib/server/assign";
import type { Override, TxRow } from "../lib/server/db";
import { detectSubscriptions } from "../lib/server/detect";
import { merchantKey } from "../lib/server/merchant";

let n = 0;
const tx = (date: string, amount: number, description: string, currency = "EUR"): TxRow => ({
  id: `a${n++}`,
  source: "csv",
  account: null,
  date,
  amount_minor: Math.round(amount * 100),
  currency,
  description,
  merchant_key: merchantKey(description),
  type: "CARD_PAYMENT",
  state: "COMPLETED",
});

const netflix = ["2025-01-05", "2025-02-05", "2025-03-05"].map((d) => tx(d, -12.99, "Netflix.com"));
const stray = tx("2025-03-20", -4.99, "Netflix.com");
const refund = tx("2025-03-21", 4.99, "Netflix.com");
const usd = tx("2025-03-22", -5, "Netflix.com", "USD");
const coffee = tx("2025-03-23", -3.2, "Caif Cafe");
const txs = [...netflix, stray, refund, usd, coffee];
const det = detectSubscriptions(txs, new Map<string, Override>(), "2025-03-25");

test("adding to a detected subscription pins the charges it already had", () => {
  const plan = planAssignment(txs, det, new Set(), "netflix|EUR", [stray.id]);
  assert.ok(plan.ok);
  assert.equal(plan.key, "netflix|EUR");
  assert.deepEqual(new Set(plan.txIds), new Set([...netflix.map((t) => t.id), stray.id]));
});

test("a new subscription gets a key no detected subscription or saved edit uses", () => {
  const fresh = planAssignment(txs, det, new Set(), null, [coffee.id]);
  assert.ok(fresh.ok);
  assert.equal(fresh.key, "caif-cafe|EUR");
  const taken = planAssignment(txs, det, new Set(["caif-cafe|EUR"]), null, [coffee.id]);
  assert.ok(taken.ok);
  assert.equal(taken.key, "caif-cafe|EUR|320");
  const clash = planAssignment(txs, det, new Set(), null, [stray.id]);
  assert.ok(clash.ok);
  assert.equal(clash.key, "netflix|EUR|499", "netflix|EUR is the detected subscription");
});

test("rejects incoming money, other currencies, unknown ids and unknown subscriptions", () => {
  const status = (p: ReturnType<typeof planAssignment>) => (p.ok ? 200 : p.status);
  assert.equal(status(planAssignment(txs, det, new Set(), "netflix|EUR", [refund.id])), 400);
  assert.equal(status(planAssignment(txs, det, new Set(), "netflix|EUR", [usd.id])), 400);
  assert.equal(status(planAssignment(txs, det, new Set(), null, [stray.id, usd.id])), 400);
  assert.equal(status(planAssignment(txs, det, new Set(), "netflix|EUR", ["nope"])), 404);
  assert.equal(status(planAssignment(txs, det, new Set(), "nope|EUR", [stray.id])), 404);
  assert.equal(status(planAssignment(txs, det, new Set(), "netflix|EUR", [])), 400);
});

test("splitting a confirmed merchant pins one subscription per price", () => {
  const month = (m: number, day: number) => `2026-${String(m).padStart(2, "0")}-${day}`;
  // Prime went from 4.49 to 4.99 while the ad-free add-on billed alongside; a 3.49 one-off came last.
  const prime = [1, 2, 3, 4, 5].map((m) => tx(month(m, 12), m < 3 ? -4.49 : -4.99, "Amazon Prime*2K4LD8"));
  const adFree = [2, 3, 4, 5].map((m) => tx(month(m, 14), -2.99, "Prime Video ad free"));
  const oneOff = tx(month(5, 20), -3.49, "Amazon Prime*X");
  const all = [...prime, ...adFree, oneOff];
  const key = "prime-video|EUR";
  const confirmed = new Map<string, Override>([
    [
      key,
      {
        key,
        display_name: null,
        category: null,
        status: "confirmed",
        color_slot: null,
        color_hex: null,
        cadence: null,
        website: null,
        group_name: null,
      },
    ],
  ]);
  const merged = detectSubscriptions(all, confirmed, "2026-05-20");
  assert.equal(merged.subscriptions.length, 1);
  const members = all.filter((t) => merged.txToSub.get(t.id) === key);
  assert.ok(plansOverlap(pricePlans(members)));

  const plan = planSplit(all, merged, new Set([key]), key);
  assert.ok(plan.ok);
  assert.deepEqual(
    plan.parts.map((p) => [p.key, p.amountMinor, p.txIds.length, p.isNew]),
    [
      [key, 499, 5, false], // 4.49 then 4.99: one plan with a price change
      ["prime-video|EUR|299", 299, 4, true], // the 3.49 one-off joins neither
    ],
  );

  const assigned = new Map(plan.parts.flatMap((p) => p.txIds.map((id) => [id, p.key] as const)));
  const split = detectSubscriptions(all, confirmed, "2026-05-20", "EUR", new Set(), assigned);
  assert.deepEqual(split.subscriptions.map((s) => [s.amount, s.nextCharge]).sort(), [
    [2.99, "2026-06-14"],
    [4.99, "2026-06-12"],
  ]);
  assert.equal(split.txToSub.get(oneOff.id), undefined);

  assert.equal(planSplit(txs, det, new Set(), "netflix|EUR").ok, false);
  // A price change (old price stops, new one starts) is not offered as a split.
  const change = [1, 2, 3]
    .map((m) => tx(month(m, 5), -12.99, "Netflix.com"))
    .concat([4, 5, 6].map((m) => tx(month(m, 5), -15.99, "Netflix.com")));
  assert.equal(plansOverlap(pricePlans(change)), false);
});
