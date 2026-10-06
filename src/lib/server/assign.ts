import type { TxRow } from "./db";
import { clusterByAmount, type Detection, median, runInParallel } from "./detect";

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

type Plan = { amountMinor: number; txs: TxRow[] };

const datesOf = (txs: TxRow[]) => [...new Set(txs.map((t) => t.date))].sort();
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

/**
 * A subscription's charges grouped into the plans billed side by side, for "Split by price". Every
 * price paid at least twice is a price point; one whose first charge lands when another's next
 * charge was due (about one billing period after its last) continues that plan as a price change. One-off prices belong to no plan, so
 * they can't become a plan's latest charge (its price, and what its renewals are matched against).
 * Fewer than two plans means there is nothing to split. Plans come most expensive first, priced
 * at their latest charge.
 */
export function pricePlans(members: TxRow[]): Plan[] {
  const points = clusterByAmount(members)
    .filter((c) => c.length >= 2)
    .map((txs) => ({ txs, dates: datesOf(txs), amountMinor: Math.round(-median(txs.map((t) => t.amount_minor))) }))
    .sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
  const chains: (typeof points)[] = [];
  for (const p of points) {
    const candidates = chains.filter((chain) => {
      const last = chain[chain.length - 1];
      const gap = daysBetween(last.dates[last.dates.length - 1], p.dates[0]);
      const period = daysBetween(last.dates[0], last.dates[last.dates.length - 1]) / (last.dates.length - 1);
      return gap >= period * 0.5 && gap <= period * 1.5;
    });
    const closest = (chain: typeof points) => Math.abs(chain[chain.length - 1].amountMinor - p.amountMinor);
    const into = candidates.sort((a, b) => closest(a) - closest(b))[0];
    if (into) into.push(p);
    else chains.push([p]);
  }
  if (chains.length < 2) return [];
  return chains
    .map((chain) => ({
      amountMinor: chain[chain.length - 1].amountMinor,
      txs: chain.flatMap((p) => p.txs).sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

/** True when two of the plans bill side by side (see `runInParallel`): worth offering a split. */
export function plansOverlap(plans: Plan[]): boolean {
  const dates = plans.map((p) => datesOf(p.txs));
  return dates.some((a, i) => dates.slice(i + 1).some((b) => runInParallel(a, b)));
}

export type SplitPlan =
  | { ok: true; parts: { key: string; txIds: string[]; amountMinor: number; isNew: boolean }[] }
  | { ok: false; status: number; error: string };

/**
 * Splits one subscription into one per price it's billed at (e.g. Prime and its ad-free add-on
 * under one merchant). Every part is pinned, so detection keeps them apart from now on. The most
 * expensive plan keeps the subscription's key (and so its name, colour and other edits); the
 * others get fresh keys. One-off charges at other prices stay out of every part. `takenKeys` are
 * keys with saved edits that a new part must not inherit.
 */
export function planSplit(txs: TxRow[], det: Detection, takenKeys: ReadonlySet<string>, subKey: string): SplitPlan {
  const target = det.subscriptions.find((s) => s.key === subKey);
  if (!target) return { ok: false, status: 404, error: "Subscription not found" };
  const members = txs.filter((t) => det.txToSub.get(t.id) === subKey);
  const plans = pricePlans(members);
  if (!plansOverlap(plans)) return { ok: false, status: 400, error: "This subscription isn't billed at several prices side by side" };

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
