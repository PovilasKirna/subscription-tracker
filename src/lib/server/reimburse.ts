import type { ChargeReimbursement, ReimbursementPeriod, ReimbursementSource } from "../types";
import type { PeriodRow, ReimbursementData, SourceRow, TxRow } from "./db";
import type { Detection } from "./detect";

// Reimbursements, derived (never stored): a subscription's periods say who pays back how much per
// charge from which day; what the user recorded for a charge always wins. Pure, no DB, so editing
// a period simply re-derives every charge that has nothing recorded.

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The period in force on `date`: the latest one starting on or before it. `periods` oldest first. */
export function periodOn(periods: readonly PeriodRow[], date: string): PeriodRow | undefined {
  let found: PeriodRow | undefined;
  for (const p of periods) {
    if (p.starts_on > date) break;
    found = p;
  }
  return found;
}

/**
 * What one charge (minor units, positive) gets back: what the user recorded for it, else what its
 * period's source implies — assumed for an automatic source, pending for one you must request.
 * No period yet (ordinary spend), a stop, or an unknown source → not reimbursable.
 */
export function resolveCharge(
  chargeMinor: number,
  recordedMinor: number | undefined,
  period: PeriodRow | undefined,
  source: SourceRow | undefined,
): ChargeReimbursement {
  const paidBy = period && period.source_id !== null && source?.id === period.source_id ? source : undefined;
  // Never more back than the charge cost.
  const expectedMinor = period && paidBy ? Math.max(0, Math.min(period.amount_minor, chargeMinor)) : null;
  const base = { expected: expectedMinor === null ? null : expectedMinor / 100, sourceId: paidBy?.id ?? null };
  if (recordedMinor !== undefined) return { status: "recorded", amount: recordedMinor / 100, ...base };
  if (expectedMinor === null || !paidBy) return { status: "none", amount: 0, ...base };
  return { status: paidBy.mode === "automatic" ? "assumed" : "pending", amount: expectedMinor / 100, ...base };
}

function toPeriod(p: PeriodRow, sources: ReadonlyMap<number, SourceRow>): ReimbursementPeriod {
  const source = p.source_id === null ? undefined : sources.get(p.source_id);
  return {
    id: p.id,
    startsOn: p.starts_on,
    amount: p.amount_minor / 100,
    source: source ? { id: source.id, name: source.name, mode: source.mode } : null,
  };
}

/**
 * Puts the reimbursement state on every detected subscription and its charges (mutating `det`).
 * A charge is one payment day (like detection's charges); records on any payment of that day count
 * for it. Returns, per charge, the result keyed by the payment that stands for it: the one with a
 * record, else the biggest payment that day.
 */
export function applyReimbursements(
  det: Detection,
  txs: readonly TxRow[],
  data: ReimbursementData,
  today: string,
): Map<string, ChargeReimbursement> {
  const days = new Map<string, TxRow[]>();
  for (const t of txs) {
    const key = det.txToSub.get(t.id);
    if (key === undefined) continue;
    const k = `${key}\n${t.date}`;
    const day = days.get(k);
    if (day) day.push(t);
    else days.set(k, [t]);
  }

  const byTx = new Map<string, ChargeReimbursement>();
  for (const s of det.subscriptions) {
    const periods = data.periods.get(s.key) ?? [];
    let reimbursedMinor = 0;
    let pending = 0;
    for (const ch of s.charges) {
      const rows = days.get(`${s.key}\n${ch.date}`) ?? [];
      const recordedRows = rows.filter((t) => data.records.has(t.id));
      const recorded = recordedRows.length ? recordedRows.reduce((sum, t) => sum + (data.records.get(t.id) ?? 0), 0) : undefined;
      const period = periodOn(periods, ch.date);
      const source = period?.source_id != null ? data.sources.get(period.source_id) : undefined;
      const r = resolveCharge(Math.round(ch.amount * 100), recorded, period, source);
      if (r.status !== "none") ch.reimbursement = r;
      if (r.status === "recorded" || r.status === "assumed") reimbursedMinor += Math.round(r.amount * 100);
      if (r.status === "pending") pending++;
      const carrier = recordedRows[0] ?? [...rows].sort((a, b) => a.amount_minor - b.amount_minor)[0];
      if (carrier) byTx.set(carrier.id, r);
    }
    s.totalReimbursed = reimbursedMinor / 100;
    s.pendingReimbursements = pending;
    s.reimbursementPeriods = periods.map((p) => toPeriod(p, data.sources)).reverse();
    const current = periodOn(periods, today);
    const period = current ? toPeriod(current, data.sources) : null;
    s.reimbursement = period?.source ? period : null;
    // Both modes: what the current period expects back comes off the monthly cost.
    const expected = s.reimbursement ? Math.min(s.reimbursement.amount, s.amount) : 0;
    s.netMonthlyCost = round2(((s.amount - expected) * 30.4375) / s.periodDays);
  }
  // Ignored subscriptions keep their period history so periods set up before can still be removed.
  for (const s of det.ignored) {
    s.reimbursementPeriods = (data.periods.get(s.key) ?? []).map((p) => toPeriod(p, data.sources)).reverse();
  }
  return byTx;
}

/** The sources with the subscriptions that use them and how many of their charges are pending. */
export function summarizeSources(sources: readonly SourceRow[], data: ReimbursementData, det: Detection): ReimbursementSource[] {
  const subs = new Map([...det.subscriptions, ...det.ignored].map((s) => [s.key, s]));
  const pending = new Map<number, number>();
  for (const s of det.subscriptions) {
    for (const ch of s.charges) {
      const r = ch.reimbursement;
      if (r?.status === "pending" && r.sourceId !== null) pending.set(r.sourceId, (pending.get(r.sourceId) ?? 0) + 1);
    }
  }
  return sources.map((src) => {
    const users: ReimbursementSource["subscriptions"] = [];
    for (const [key, periods] of data.periods) {
      const own = periods.filter((p) => p.source_id === src.id);
      if (!own.length) continue;
      const sub = subs.get(key);
      users.push({
        key,
        periods: own.map((p) => ({ id: p.id, startsOn: p.starts_on })),
        // A period can outlive its subscription (e.g. after charges were removed); fall back to the merchant.
        name: sub?.name ?? key.split("|")[0],
        current: sub?.reimbursement?.source?.id === src.id,
      });
    }
    users.sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    return {
      id: src.id,
      name: src.name,
      mode: src.mode,
      reminderDay: src.mode === "request" ? src.reminder_day : null,
      subscriptions: users,
      pending: pending.get(src.id) ?? 0,
    };
  });
}
