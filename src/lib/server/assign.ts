import type { TxRow } from "./db";
import type { Detection } from "./detect";

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
