import assert from "node:assert/strict";
import { test } from "node:test";
import { projectChargesBetween, spendByMerchant } from "../lib/insights";
import type { Charge, Subscription, SubscriptionsPayload } from "../lib/types";

const TODAY = "2026-10-05";

function sub(over: Partial<Subscription> & Pick<Subscription, "key" | "charges">): Subscription {
  return {
    merchantKey: over.key,
    name: over.key,
    currency: "EUR",
    cadence: "monthly",
    status: "active",
    amount: 10,
    nextCharge: null,
    color: null,
    ...over,
  } as Subscription;
}

const paid = (date: string, amount: number): Charge => ({ date, amount });
const reimbursed = (date: string, amount: number, back: number, status: "recorded" | "assumed" | "pending" = "assumed"): Charge => ({
  date,
  amount,
  reimbursement: { status, amount: back, expected: back, sourceId: 1 },
});

const payload = (subscriptions: Subscription[]): SubscriptionsPayload => ({
  baseCurrency: "EUR",
  today: TODAY,
  subscriptions,
  ignored: [],
});

test("spend by merchant: last 12 months vs year to date, with what was paid back split out", () => {
  const p = payload([
    sub({
      key: "gym",
      charges: [
        paid("2025-10-05", 30),
        reimbursed("2025-12-01", 30, 20),
        reimbursed("2026-02-01", 30, 20),
        reimbursed("2026-03-01", 30, 20, "pending"),
      ],
    }),
    // Two plans of one merchant merge; a foreign-currency one is left out.
    sub({ key: "tv-a", merchantKey: "tv", name: "TV · Basic", charges: [paid("2026-01-10", 5)] }),
    sub({ key: "tv-b", merchantKey: "tv", name: "TV · Premium", charges: [reimbursed("2026-05-10", 12, 12, "recorded")] }),
    sub({ key: "usd", currency: "USD", charges: [paid("2026-05-01", 99)] }),
  ]);

  const year = Object.fromEntries(spendByMerchant(p, "12m").map((m) => [m.merchantKey, m]));
  // 2025-10-05 is exactly 12 months back, so it falls outside the window.
  assert.deepEqual(year.gym, { merchantKey: "gym", name: "gym", total: 90, subsidised: 40 });
  assert.deepEqual(year.tv, { merchantKey: "tv", name: "TV", total: 17, subsidised: 12 });
  assert.equal(year.usd, undefined);

  const ytd = Object.fromEntries(spendByMerchant(p, "ytd").map((m) => [m.merchantKey, m]));
  assert.deepEqual(ytd.gym, { merchantKey: "gym", name: "gym", total: 60, subsidised: 20 });
});

test("projected charges between two dates: only live subscriptions, stepping by cadence", () => {
  const subs = [
    sub({ key: "monthly", nextCharge: "2026-10-20", amount: 9, charges: [] }),
    sub({ key: "weekly", cadence: "weekly", nextCharge: "2026-10-30", amount: 2, charges: [] }),
    sub({ key: "cancelled", status: "cancelled", nextCharge: "2026-11-03", charges: [] }),
  ];
  const november = projectChargesBetween(subs, "2026-11-01", "2026-12-01");
  assert.deepEqual(
    november.map((c) => [c.date, c.key]),
    [
      ["2026-11-06", "weekly"],
      ["2026-11-13", "weekly"],
      ["2026-11-20", "monthly"],
      ["2026-11-20", "weekly"],
      ["2026-11-27", "weekly"],
    ],
  );
});
