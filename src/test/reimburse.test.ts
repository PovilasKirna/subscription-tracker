import assert from "node:assert/strict";
import { test } from "node:test";
import { charged, expectedFor, ordinal, parseAmount, periodStartLabel, startOptions } from "../lib/reimbursement";
import type { Override, PeriodRow, ReimbursementData, SourceRow, TxRow } from "../lib/server/db";
import { buildHistory, detectSubscriptions } from "../lib/server/detect";
import { merchantKey } from "../lib/server/merchant";
import { applyReimbursements, chargeTotalMinor, periodOn, resolveCharge, summarizeSources } from "../lib/server/reimburse";
import { isIsoDate, parsePeriodInput, parseSourceInput, toMinor } from "../lib/server/reimbursementInput";

const salary: SourceRow = { id: 1, name: "Salary", mode: "request", reminder_day: 20 };
const insurer: SourceRow = { id: 2, name: "Insurer", mode: "automatic", reminder_day: null };
const sources = new Map([salary, insurer].map((s) => [s.id, s]));

let pid = 0;
const period = (starts_on: string, source_id: number | null, amount_minor: number, sub_key = "anthropic|EUR"): PeriodRow => ({
  id: ++pid,
  sub_key,
  source_id,
  amount_minor,
  starts_on,
});

test("periodOn picks the latest period starting on or before the date", () => {
  const ps = [period("2025-02-01", 1, 1500), period("2025-04-01", null, 0), period("2025-06-01", 2, 1000)];
  assert.equal(periodOn(ps, "2025-01-31"), undefined);
  assert.equal(periodOn(ps, "2025-02-01")?.starts_on, "2025-02-01");
  assert.equal(periodOn(ps, "2025-03-15")?.starts_on, "2025-02-01");
  assert.equal(periodOn(ps, "2025-05-20")?.source_id, null);
  assert.equal(periodOn(ps, "2026-01-01")?.starts_on, "2025-06-01");
  assert.equal(periodOn([], "2025-01-01"), undefined);
});

test("resolveCharge: request → pending, automatic → assumed, both capped at the charge", () => {
  const p = period("2025-01-01", 1, 1500);
  assert.deepEqual(resolveCharge(1800, undefined, p, salary), { status: "pending", amount: 15, expected: 15, sourceId: 1 });
  const auto = period("2025-01-01", 2, 1500);
  assert.deepEqual(resolveCharge(1800, undefined, auto, insurer), { status: "assumed", amount: 15, expected: 15, sourceId: 2 });
  // Never more back than the charge cost.
  assert.deepEqual(resolveCharge(1200, undefined, auto, insurer), { status: "assumed", amount: 12, expected: 12, sourceId: 2 });
});

test("resolveCharge: an explicit record always wins, even 0 and even outside any period", () => {
  const p = period("2025-01-01", 2, 1500);
  assert.deepEqual(resolveCharge(1800, 0, p, insurer), { status: "recorded", amount: 0, expected: 15, sourceId: 2 });
  assert.deepEqual(resolveCharge(1800, 1800, p, insurer), { status: "recorded", amount: 18, expected: 15, sourceId: 2 });
  assert.deepEqual(resolveCharge(1800, 500, undefined, undefined), { status: "recorded", amount: 5, expected: null, sourceId: null });
});

test("resolveCharge: no period, a stop or a missing source is not reimbursable", () => {
  const none = { status: "none", amount: 0, expected: null, sourceId: null };
  assert.deepEqual(resolveCharge(1800, undefined, undefined, undefined), none);
  assert.deepEqual(resolveCharge(1800, undefined, period("2025-01-01", null, 0), undefined), none);
  assert.deepEqual(resolveCharge(1800, undefined, period("2025-01-01", 9, 1500), undefined), none);
  // A source that isn't the period's (shouldn't happen) doesn't count either.
  assert.deepEqual(resolveCharge(1800, undefined, period("2025-01-01", 1, 1500), insurer), none);
});

let n = 0;
function tx(date: string, amount: number, description = "Claude.ai"): TxRow {
  return {
    id: `r${n++}`,
    source: "csv",
    account: "Current",
    date,
    amount_minor: Math.round(amount * 100),
    currency: "EUR",
    description,
    merchant_key: merchantKey(description),
    type: "CARD_PAYMENT",
    state: "COMPLETED",
  };
}
/** Six €18 Claude charges on the 7th, Jan–Jun 2025. */
const claude = () => Array.from({ length: 6 }, (_, i) => tx(`2025-0${i + 1}-07`, -18));
const none = new Map<string, Override>();
const data = (periods: PeriodRow[], records: [string, number][] = []): ReimbursementData => ({
  sources,
  periods: new Map([["anthropic|EUR", periods]]),
  records: new Map(records),
});

test("charges before the first period are ordinary spend; later ones pend until recorded", () => {
  const txs = claude();
  const det = detectSubscriptions(txs, none, "2025-06-20");
  const byTx = applyReimbursements(det, txs, data([period("2025-03-01", 1, 1500)], [[txs[3].id, 1500]]), "2025-06-20");
  const s = det.subscriptions[0];
  assert.equal(s.key, "anthropic|EUR");
  assert.deepEqual(
    s.charges.map((c) => c.reimbursement?.status),
    [undefined, undefined, "pending", "recorded", "pending", "pending"],
  );
  assert.equal(s.pendingReimbursements, 3);
  assert.equal(s.totalReimbursed, 15);
  assert.equal(s.reimbursement?.source?.name, "Salary");
  assert.equal(s.reimbursement?.amount, 15);
  // €18 monthly, €15 back per charge.
  assert.equal(s.netMonthlyCost, 3);
  assert.equal(s.monthlyCost, 18);
  // Every payment gets its charge's result, "none" included (so the drawer can still offer recording one).
  assert.equal(byTx.get(txs[0].id)?.status, "none");
  assert.equal(byTx.get(txs[2].id)?.status, "pending");
  assert.equal(byTx.get(txs[3].id)?.amount, 15);
});

test("periods: a change starts a new amount and source, a stop ends it; history is newest first", () => {
  const txs = claude();
  const det = detectSubscriptions(txs, none, "2025-06-20");
  const periods = [period("2025-01-01", 1, 1800), period("2025-03-01", 2, 1000), period("2025-05-01", null, 0)];
  applyReimbursements(det, txs, data(periods, [[txs[0].id, 1800]]), "2025-06-20");
  const s = det.subscriptions[0];
  assert.deepEqual(
    s.charges.map((c) => [c.reimbursement?.status, c.reimbursement?.amount]),
    [
      ["recorded", 18],
      ["pending", 18],
      ["assumed", 10],
      ["assumed", 10],
      [undefined, undefined],
      [undefined, undefined],
    ],
  );
  assert.equal(s.totalReimbursed, 38);
  assert.equal(s.pendingReimbursements, 1);
  // Stopped: nothing current, so the net cost is the full cost.
  assert.equal(s.reimbursement, null);
  assert.equal(s.netMonthlyCost, s.monthlyCost);
  assert.deepEqual(
    s.reimbursementPeriods.map((p) => [p.startsOn, p.source?.name ?? null, p.amount]),
    [
      ["2025-05-01", null, 0],
      ["2025-03-01", "Insurer", 10],
      ["2025-01-01", "Salary", 18],
    ],
  );
});

test("an upcoming period isn't current yet; the expected amount comes off even for automatic sources", () => {
  const txs = claude();
  const det = detectSubscriptions(txs, none, "2025-06-20");
  applyReimbursements(det, txs, data([period("2025-06-01", 2, 2000), period("2025-07-01", null, 0)]), "2025-06-20");
  const s = det.subscriptions[0];
  assert.equal(s.reimbursement?.source?.mode, "automatic");
  // Capped at the €18 price.
  assert.equal(s.netMonthlyCost, 0);
  assert.equal(s.totalReimbursed, 18);
  assert.equal(s.reimbursementPeriods[0].startsOn, "2025-07-01");
});

test("a charge day's records count once for the day, on the payment that carries them", () => {
  const txs = claude();
  const fee = tx("2025-06-07", -0.5);
  const all = [...txs, fee];
  const det = detectSubscriptions(all, none, "2025-06-20");
  const s = det.subscriptions[0];
  assert.equal(s.charges.at(-1)?.amount, 18.5);
  // Nothing recorded: the bigger payment stands for the charge.
  let byTx = applyReimbursements(det, all, data([period("2025-06-01", 1, 2000)]), "2025-06-20");
  assert.equal(byTx.get(txs[5].id)?.status, "pending");
  assert.equal(byTx.get(txs[5].id)?.amount, 18.5);
  assert.equal(byTx.has(fee.id), false);
  // Recorded on the fee line: that payment carries the charge now.
  const det2 = detectSubscriptions(all, none, "2025-06-20");
  byTx = applyReimbursements(det2, all, data([period("2025-06-01", 1, 2000)], [[fee.id, 50]]), "2025-06-20");
  assert.equal(byTx.get(fee.id)?.status, "recorded");
  assert.equal(byTx.has(txs[5].id), false);
  assert.equal(det2.subscriptions[0].pendingReimbursements, 0);
});

test("a split charge (€18 + €0.50 fee) can be reimbursed up to its day total, whichever payment carries it", () => {
  const txs = claude();
  const fee = tx("2025-06-07", -0.5);
  const other = tx("2025-06-07", -3, "Lidl");
  const all = [...txs, fee, other];
  const det = detectSubscriptions(all, none, "2025-06-20");
  const byTx = applyReimbursements(det, all, data([period("2025-06-01", 1, 2000)]), "2025-06-20");
  // The cap the API and the drawer use: the whole charge, not the carrier row.
  assert.equal(chargeTotalMinor(txs[5], all, det.txToSub), 1850);
  assert.equal(chargeTotalMinor(fee, all, det.txToSub), 1850);
  assert.equal(chargeTotalMinor(txs[4], all, det.txToSub), 1800);
  // Outside any subscription a payment is its own charge (another merchant that day doesn't add up).
  assert.equal(chargeTotalMinor(other, all, det.txToSub), 300);
  // The drawer's item for the carrier: "Got €18.50", and the dialog allows up to €18.50.
  const item = { amount: -18, chargeTotal: 18.5, reimbursement: byTx.get(txs[5].id) };
  assert.equal(charged(item), 18.5);
  assert.equal(expectedFor(item), 18.5);
  // Without a charge total (a single payment) it falls back to the payment itself.
  assert.equal(charged({ amount: -18 }), 18);
  assert.equal(expectedFor({ amount: -18, reimbursement: { status: "pending", amount: 15, expected: 20, sourceId: 1 } }), 18);
});

test("monthly history reports recorded + assumed reimbursements by charge month", () => {
  const txs = claude();
  const det = detectSubscriptions(txs, none, "2025-06-20");
  applyReimbursements(
    det,
    txs,
    data(
      [period("2025-04-01", 2, 1200)],
      [
        [txs[4].id, 0],
        [txs[1].id, 900],
      ],
    ),
    "2025-06-20",
  );
  const history = buildHistory(txs, det, "EUR", "2025-06-20", 6);
  assert.deepEqual(history.reimbursed, [0, 9, 0, 12, 0, 12]);
});

test("summarizeSources lists who uses each source and counts pending charges", () => {
  const txs = [...claude(), ...Array.from({ length: 6 }, (_, i) => tx(`2025-0${i + 1}-03`, -11.99, "Spotify"))];
  const det = detectSubscriptions(txs, none, "2025-06-20");
  const d: ReimbursementData = {
    sources: new Map([...sources, [3, { id: 3, name: "Unused", mode: "request", reminder_day: 5 }]]),
    periods: new Map([
      ["anthropic|EUR", [period("2025-05-01", 1, 1500)]],
      ["spotify|EUR", [period("2025-01-01", 1, 500, "spotify|EUR"), period("2025-03-01", 2, 500, "spotify|EUR")]],
      ["gone|EUR", [period("2025-01-01", 2, 100, "gone|EUR")]],
    ]),
    records: new Map(),
  };
  applyReimbursements(det, txs, d, "2025-06-20");
  const out = summarizeSources([...d.sources.values()], d, det);
  const by = Object.fromEntries(out.map((s) => [s.name, s]));
  assert.deepEqual(
    by.Salary.subscriptions.map((u) => [u.name, u.current]),
    [
      ["Claude", true],
      ["Spotify", false],
    ],
  );
  // Claude: May + Jun pending; Spotify: Jan + Feb pending under Salary.
  assert.equal(by.Salary.pending, 4);
  assert.equal(by.Salary.reminderDay, 20);
  assert.deepEqual(
    by.Insurer.subscriptions.map((u) => [u.name, u.current]),
    [
      ["Spotify", true],
      ["gone", false],
    ],
  );
  assert.equal(by.Insurer.pending, 0);
  assert.equal(by.Insurer.reminderDay, null);
  assert.deepEqual(by.Unused.subscriptions, []);
  // Each user lists its own periods from that source, so they can be removed from the source.
  const spotify = by.Salary.subscriptions.find((u) => u.key === "spotify|EUR");
  assert.deepEqual(
    spotify?.periods.map((p) => p.startsOn),
    ["2025-01-01"],
  );
  assert.deepEqual(
    by.Insurer.subscriptions.find((u) => u.key === "gone|EUR")?.periods.map((p) => p.startsOn),
    ["2025-01-01"],
  );
});

test("applyReimbursements keeps the period history of ignored subscriptions", () => {
  const txs = claude();
  const ignore: Override = {
    key: "anthropic|EUR",
    display_name: null,
    category: null,
    status: "ignored",
    color_slot: null,
    color_hex: null,
    cadence: null,
    website: null,
  };
  const det = detectSubscriptions(txs, new Map([[ignore.key, ignore]]), "2025-06-20");
  assert.equal(det.ignored.length, 1);
  const d: ReimbursementData = { sources, periods: new Map([["anthropic|EUR", [period("2025-05-01", 1, 1500)]]]), records: new Map() };
  applyReimbursements(det, txs, d, "2025-06-20");
  assert.deepEqual(
    det.ignored[0].reimbursementPeriods.map((p) => [p.startsOn, p.source?.name]),
    [["2025-05-01", "Salary"]],
  );
});

test("parseSourceInput validates name, mode and reminder day", () => {
  assert.deepEqual(parseSourceInput({ name: " Salary ", mode: "request", reminderDay: 20 }), {
    ok: true,
    value: { name: "Salary", mode: "request", reminderDay: 20 },
  });
  assert.deepEqual(parseSourceInput({ name: "Salary", mode: "request" }), {
    ok: true,
    value: { name: "Salary", mode: "request", reminderDay: 20 },
  });
  assert.deepEqual(parseSourceInput({ name: "Insurer", mode: "automatic", reminderDay: 3 }), {
    ok: true,
    value: { name: "Insurer", mode: "automatic", reminderDay: null },
  });
  assert.equal(parseSourceInput({ name: "  ", mode: "request" }).ok, false);
  assert.equal(parseSourceInput({ name: "x".repeat(61), mode: "request" }).ok, false);
  assert.equal(parseSourceInput({ name: "X", mode: "monthly" }).ok, false);
  assert.equal(parseSourceInput({ name: "X", mode: "request", reminderDay: 29 }).ok, false);
  assert.equal(parseSourceInput({ name: "X", mode: "request", reminderDay: 0 }).ok, false);
  assert.equal(parseSourceInput({ name: "X", mode: "request", reminderDay: 2.5 }).ok, false);
  assert.equal(parseSourceInput(null).ok, false);
});

test("parsePeriodInput: stops, existing/new/default sources, amount and date checks", () => {
  const today = "2026-10-04";
  assert.deepEqual(parsePeriodInput({ subKey: "a|EUR", startsOn: "2026-10-01", stop: true }, today), {
    ok: true,
    value: { subKey: "a|EUR", startsOn: "2026-10-01", source: { kind: "stop" }, amountMinor: 0 },
  });
  assert.deepEqual(parsePeriodInput({ subKey: "a|EUR", startsOn: "2026-09-01", amount: 15.5, sourceId: 2 }, today), {
    ok: true,
    value: { subKey: "a|EUR", startsOn: "2026-09-01", source: { kind: "existing", id: 2 }, amountMinor: 1550 },
  });
  assert.deepEqual(parsePeriodInput({ subKey: "a|EUR", startsOn: "2026-09-01", amount: 15 }, today), {
    ok: true,
    value: { subKey: "a|EUR", startsOn: "2026-09-01", source: { kind: "default" }, amountMinor: 1500 },
  });
  const created = parsePeriodInput(
    { subKey: "a|EUR", startsOn: "2026-09-01", amount: 15, newSource: { name: "Bonus", mode: "automatic" } },
    today,
  );
  assert.deepEqual(created.ok && created.value.source, { kind: "new", input: { name: "Bonus", mode: "automatic", reminderDay: null } });
  assert.equal(parsePeriodInput({ subKey: "a|EUR", startsOn: "2026-09-01", amount: 15, newSource: { name: "" } }, today).ok, false);
  assert.equal(parsePeriodInput({ subKey: "a|EUR", startsOn: "2026-09-01", amount: 0 }, today).ok, false);
  assert.equal(parsePeriodInput({ subKey: "a|EUR", startsOn: "2026-09-01", amount: -3 }, today).ok, false);
  assert.equal(parsePeriodInput({ subKey: "a|EUR", startsOn: "2026-09-01", amount: "15" }, today).ok, false);
  assert.equal(parsePeriodInput({ subKey: "a|EUR", startsOn: "2026-09-01", amount: 15, sourceId: "2" }, today).ok, false);
  assert.equal(parsePeriodInput({ subKey: "a|EUR", startsOn: "2026-02-30", amount: 15 }, today).ok, false);
  assert.equal(parsePeriodInput({ subKey: "a|EUR", startsOn: "2028-01-01", amount: 15 }, today).ok, false);
  assert.equal(parsePeriodInput({ subKey: "", startsOn: "2026-09-01", amount: 15 }, today).ok, false);
});

test("toMinor and isIsoDate", () => {
  assert.equal(toMinor(12.345), 1235);
  assert.equal(toMinor(0), null);
  assert.equal(toMinor(0, { allowZero: true }), 0);
  assert.equal(toMinor(-1, { allowZero: true }), null);
  assert.equal(toMinor(Number.NaN), null);
  assert.equal(toMinor(1e8), null);
  assert.equal(isIsoDate("2024-02-29"), true);
  assert.equal(isIsoDate("2025-02-29"), false);
  assert.equal(isIsoDate("2025-1-01"), false);
});

test("startOptions: next charge onwards first, then each month with a charge, newest first", () => {
  const dates = ["2026-07-07", "2026-08-07", "2026-09-03", "2026-09-07"];
  // No charge yet this month: this month is "next charge onwards".
  assert.deepEqual(
    startOptions(dates, "2026-10-04").map((o) => [o.value, o.hint]),
    [
      ["2026-10-01", "next charge onwards"],
      ["2026-09-01", "from the 3 Sept charge"],
      ["2026-08-01", "from the 7 Aug charge"],
      ["2026-07-01", "from the 7 Jul charge"],
    ],
  );
  // Already charged this month: next month is the first one without.
  assert.deepEqual(
    startOptions(dates, "2026-09-20")
      .slice(0, 2)
      .map((o) => o.value),
    ["2026-10-01", "2026-09-01"],
  );
  assert.equal(startOptions(["2026-12-07"], "2026-12-10")[0].value, "2027-01-01");
  // A monthly plan whose next charge is next month still starts at the month.
  assert.equal(startOptions(["2026-12-07"], "2026-12-10", "2027-01-07")[0].value, "2027-01-01");
  // Weekly: the next charge is still this month, so start right after the latest one instead of
  // skipping the rest of the month; the label is then the exact day.
  const weekly = startOptions(["2026-09-03", "2026-09-10", "2026-09-17"], "2026-09-20", "2026-09-24");
  assert.deepEqual(
    weekly.map((o) => [o.value, o.label, o.hint]),
    [
      ["2026-09-18", "18 Sept 2026", "next charge onwards"],
      ["2026-09-01", "Sept 2026", "from the 3 Sept charge"],
    ],
  );
  // ...and when the weekly charge is late, from the day after the last one that came.
  assert.equal(startOptions(["2026-09-03", "2026-09-10"], "2026-09-20", "2026-09-17")[0].value, "2026-09-11");
  // The next weekly charge falls next month: start at next month.
  assert.equal(startOptions(["2026-09-28"], "2026-09-29", "2026-10-05")[0].value, "2026-10-01");
  assert.equal(startOptions([], "2026-10-04").length, 1);
});

test("periodStartLabel: the month for a month start, otherwise the day", () => {
  assert.equal(periodStartLabel("2026-09-01"), "Sept 2026");
  assert.equal(periodStartLabel("2026-09-18"), "18 Sept 2026");
});

test("ordinal and parseAmount", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 20, 21, 22, 23, 28].map(ordinal), [
    "1st",
    "2nd",
    "3rd",
    "4th",
    "11th",
    "12th",
    "13th",
    "20th",
    "21st",
    "22nd",
    "23rd",
    "28th",
  ]);
  assert.equal(parseAmount("12,50"), 12.5);
  assert.equal(parseAmount(" 3 "), 3);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("abc"), null);
});
