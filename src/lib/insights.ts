import type { ExpectedCharge } from "@/charts/types";
import type { OverviewRange } from "./search-params";
import type { Subscription, SubscriptionsPayload } from "./types";

// Pure derivations from the subscriptions payload, run identically on the server (SSR) and client.

const DAY = 86_400_000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);
const MONTHS: Record<Subscription["cadence"], number> = { weekly: 0, monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };

export function addMonths(date: string, months: number): string {
  const d = new Date(toTime(date));
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return toIso(d.getTime());
}
/**
 * The `n`th charge after `anchor` (n = 0 is `anchor` itself). Always counted from the anchor, never
 * from the previous charge, so a short month's clamp (Jan 31 → Feb 28) doesn't carry into March.
 */
const nthCharge = (s: Subscription, anchor: string, n: number) =>
  MONTHS[s.cadence] ? addMonths(anchor, n * MONTHS[s.cadence]) : toIso(toTime(anchor) + n * 7 * DAY);

export const isLive = (s: Subscription) => s.status === "active" || s.status === "late";

/** Every charge we expect from live subscriptions in [today, today + days). */
export function projectCharges(subs: readonly Subscription[], today: string, days: number): ExpectedCharge[] {
  return projectChargesBetween(subs, today, toIso(toTime(today) + days * DAY));
}

/** Every charge we expect from live subscriptions in [from, to) (dates YYYY-MM-DD, `from` not in the past). */
export function projectChargesBetween(subs: readonly Subscription[], from: string, to: string): ExpectedCharge[] {
  const out: ExpectedCharge[] = [];
  for (const s of subs) {
    if (!isLive(s) || !s.nextCharge) continue;
    const anchor = s.nextCharge;
    let n = 0;
    let d = anchor;
    while (d < from) d = nthCharge(s, anchor, ++n);
    for (; d < to; d = nthCharge(s, anchor, ++n)) {
      out.push({ date: d, key: s.key, name: s.name, amount: s.amount, currency: s.currency, color: s.color });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}

export type Stats = {
  /** After what the current reimbursement periods expect back. */
  monthly: number;
  /** Expected back per month from reimbursed subscriptions. */
  reimbursedMonthly: number;
  /** Charges whose reimbursement has to be requested and has nothing recorded yet. */
  pendingReimbursements: number;
  yearly: number;
  activeCount: number;
  lateCount: number;
  biggestIncrease: { key: string; name: string; from: number; to: number; pct: number; date: string; currency: string } | null;
  dueNext30: number;
};

export function computeStats(p: SubscriptionsPayload): Stats {
  const live = p.subscriptions.filter((s) => isLive(s) && s.currency === p.baseCurrency);
  const monthly = live.reduce((sum, s) => sum + s.netMonthlyCost, 0);
  const reimbursedMonthly = live.reduce((sum, s) => sum + s.monthlyCost - s.netMonthlyCost, 0);
  const yearAgo = toIso(toTime(p.today) - 365 * DAY);
  let biggestIncrease: Stats["biggestIncrease"] = null;
  for (const s of p.subscriptions) {
    for (const pc of s.priceChanges) {
      if (pc.date < yearAgo || pc.to <= pc.from) continue;
      const pct = (pc.to - pc.from) / pc.from;
      if (!biggestIncrease || pct > biggestIncrease.pct) {
        biggestIncrease = { key: s.key, name: s.name, from: pc.from, to: pc.to, pct, date: pc.date, currency: s.currency };
      }
    }
  }
  const dueNext30 = projectCharges(live, p.today, 30).reduce((sum, c) => sum + c.amount, 0);
  return {
    monthly,
    reimbursedMonthly,
    pendingReimbursements: p.subscriptions.reduce((sum, s) => sum + s.pendingReimbursements, 0),
    yearly: monthly * 12,
    activeCount: live.filter((s) => s.status === "active").length,
    lateCount: live.filter((s) => s.status === "late").length,
    biggestIncrease,
    dueNext30,
  };
}

export type MerchantSpend = {
  merchantKey: Subscription["merchantKey"];
  name: string;
  /** Everything charged. */
  total: number;
  /** The part of `total` paid back (recorded + assumed reimbursements). */
  subsidised: number;
};

/**
 * Subscription spend per merchant (plans of one merchant merged) over the last 12 months, or
 * since January 1st ("ytd"), with what was reimbursed split out.
 */
export function spendByMerchant(p: SubscriptionsPayload, range: OverviewRange = "12m"): MerchantSpend[] {
  // Inclusive lower bound: the day after a year ago, or New Year's Day.
  const since = range === "ytd" ? `${p.today.slice(0, 4)}-01-01` : toIso(toTime(addMonths(p.today, -12)) + DAY);
  const by = new Map<string, MerchantSpend>();
  for (const s of p.subscriptions) {
    if (s.currency !== p.baseCurrency) continue;
    let total = 0;
    let subsidised = 0;
    for (const c of s.charges) {
      if (c.date < since) continue;
      total += c.amount;
      const r = c.reimbursement;
      if (r?.status === "recorded" || r?.status === "assumed") subsidised += r.amount;
    }
    if (total <= 0) continue;
    const name = s.name.split(" · ")[0];
    const cur = by.get(s.merchantKey);
    if (cur) {
      cur.total += total;
      cur.subsidised += subsidised;
    } else by.set(s.merchantKey, { merchantKey: s.merchantKey, name, total, subsidised });
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return [...by.values()].map((m) => ({ ...m, total: round2(m.total), subsidised: round2(Math.min(m.subsidised, m.total)) }));
}
