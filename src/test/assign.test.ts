import assert from "node:assert/strict";
import { test } from "node:test";
import { planAssignment } from "../lib/server/assign";
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
