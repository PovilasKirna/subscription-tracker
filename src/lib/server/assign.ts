import type { TxRow } from "./db";
import { clusterByAmount, type Detection, median } from "./detect";

// Planning for "add these payments to that subscription". Kept pure (no DB) so it's testable;
// the /api/assignments route loads the inputs and writes the result.

export type AssignPlan = { ok: true; key: string; txIds: string[] } | { ok: false; status: number; error: string };

/** Hard cap per request; the dialog sends one payment plus at most a page of related ones. */
export const MAX_ASSIGN = 200;

/**
 * Works out which subscription key the payments go to and which transactions to pin to it.
 * Adding to a detected subscription pins every charge it already has as well, so its
 * membership stays put even if detection would now group the merchant differently.
 *
 * `subKey` null starts a new subscription named after the first payment's merchant.
 * `takenKeys` are keys with saved edits (overrides) that a new subscription must not inherit.
 */
export function planAssignment(
  txs: TxRow[],
  det: Detection,
  takenKeys: ReadonlySet<string>,
  subKey: string | null,
  txIds: string[],
): AssignPlan {
  const byId = new Map(txs.map((t) => [t.id, t]));
  const chosen = [...new Set(txIds)].map((id) => byId.get(id));
  if (!chosen.length) return { ok: false, status: 400, error: "No transactions given" };
  if (chosen.length > MAX_ASSIGN) return { ok: false, status: 400, error: `At most ${MAX_ASSIGN} transactions at a time` };
  if (chosen.some((t) => !t)) return { ok: false, status: 404, error: "Transaction not found" };
  const rows = chosen as TxRow[];
  if (rows.some((t) => t.amount_minor >= 0)) {
    return { ok: false, status: 400, error: "Only outgoing payments can be part of a subscription" };
  }

  if (subKey === null) {
    const first = rows[0];
    if (rows.some((t) => t.currency !== first.currency)) {
      return { ok: false, status: 400, error: "Payments in different currencies can't share a subscription" };
    }
    const used = new Set([...takenKeys, ...det.subscriptions.map((s) => s.key), ...det.ignored.map((s) => s.key)]);
    const base = `${first.merchant_key}|${first.currency}`;
    let key = used.has(base) ? `${base}|${-first.amount_minor}` : base;
    for (let n = 2; used.has(key); n++) key = `${base}|${-first.amount_minor}-${n}`;
    return { ok: true, key, txIds: rows.map((t) => t.id) };
  }

  const target = det.subscriptions.find((s) => s.key === subKey);
  if (!target) {
    const ignored = det.ignored.some((s) => s.key === subKey);
    return ignored
      ? { ok: false, status: 400, error: "That subscription is ignored; restore it first" }
      : { ok: false, status: 404, error: "Subscription not found" };
  }
  if (rows.some((t) => t.currency !== target.currency)) {
    return { ok: false, status: 400, error: `This subscription is billed in ${target.currency}` };
  }
  const members = [...det.txToSub].filter(([, k]) => k === subKey).map(([id]) => id);
  return { ok: true, key: subKey, txIds: [...new Set([...members, ...rows.map((t) => t.id)])] };
}

/**
 * A subscription's charges grouped by price, for "Split by price": every price paid at least
 * twice is a plan, and a one-off price joins the plan closest to it. Fewer than two plans means
 * there is nothing to split. Plans come most expensive first.
 */
export function pricePlans(members: TxRow[]): { amountMinor: number; txs: TxRow[] }[] {
  const clusters = clusterByAmount(members).map((txs) => ({ amountMinor: Math.round(-median(txs.map((t) => t.amount_minor))), txs }));
  const plans = clusters.filter((c) => c.txs.length >= 2);
  if (plans.length < 2) return [];
  for (const c of clusters) {
    if (c.txs.length >= 2) continue;
    const nearest = plans.reduce((a, b) => (Math.abs(b.amountMinor - c.amountMinor) < Math.abs(a.amountMinor - c.amountMinor) ? b : a));
    nearest.txs.push(...c.txs);
  }
  return plans.sort((a, b) => b.amountMinor - a.amountMinor);
}

/**
 * True when two of the plans each charge at least twice while the other is charging too: plans
 * billed side by side, not one price replacing another (a price change isn't worth splitting).
 */
export function plansOverlap(plans: { txs: TxRow[] }[]): boolean {
  const span = (txs: TxRow[]) =>
    txs.reduce((r, t) => ({ from: t.date < r.from ? t.date : r.from, to: t.date > r.to ? t.date : r.to }), { from: "9999", to: "" });
  return plans.some((a, i) =>
    plans.slice(i + 1).some((b) => {
      const sa = span(a.txs);
      const sb = span(b.txs);
      const from = sa.from > sb.from ? sa.from : sb.from;
      const to = sa.to < sb.to ? sa.to : sb.to;
      const within = (txs: TxRow[]) => new Set(txs.filter((t) => t.date >= from && t.date <= to).map((t) => t.date)).size;
      return from <= to && within(a.txs) >= 2 && within(b.txs) >= 2;
    }),
  );
}

export type SplitPlan =
  | { ok: true; parts: { key: string; txIds: string[]; amountMinor: number; isNew: boolean }[] }
  | { ok: false; status: number; error: string };

/**
 * Splits one subscription into one per price it's billed at (e.g. Prime and its ad-free add-on
 * under one merchant). Every part is pinned, so detection keeps them apart from now on. The most
 * expensive plan keeps the subscription's key (and so its name, colour and other edits); the
 * others get fresh keys. `takenKeys` are keys with saved edits that a new part must not inherit.
 */
export function planSplit(txs: TxRow[], det: Detection, takenKeys: ReadonlySet<string>, subKey: string): SplitPlan {
  const target = det.subscriptions.find((s) => s.key === subKey);
  if (!target) return { ok: false, status: 404, error: "Subscription not found" };
  const members = txs.filter((t) => det.txToSub.get(t.id) === subKey);
  const plans = pricePlans(members);
  if (!plans.length) return { ok: false, status: 400, error: "This subscription is billed at a single price" };

  const used = new Set([...takenKeys, ...det.subscriptions.map((s) => s.key), ...det.ignored.map((s) => s.key)]);
  const base = `${target.merchantKey}|${target.currency}`;
  const parts = plans.map((p, i) => {
    if (i === 0) return { key: subKey, txIds: p.txs.map((t) => t.id), amountMinor: p.amountMinor, isNew: false };
    let key = `${base}|${p.amountMinor}`;
    for (let n = 2; used.has(key); n++) key = `${base}|${p.amountMinor}-${n}`;
    used.add(key);
    return { key, txIds: p.txs.map((t) => t.id), amountMinor: p.amountMinor, isNew: true };
  });
  return { ok: true, parts };
}
