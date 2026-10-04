import type { ExpectedCharge } from "@/charts/types";
import type { Subscription, SubscriptionsPayload } from "./types";

// Pure derivations from the subscriptions payload, run identically on the server (SSR) and client.

const DAY = 86_400_000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);
const MONTHS: Record<Subscription["cadence"], number> = { weekly: 0, monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };

function addMonths(date: string, months: number): string {
  const d = new Date(toTime(date));
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return toIso(d.getTime());
}
const advance = (s: Subscription, date: string) => (MONTHS[s.cadence] ? addMonths(date, MONTHS[s.cadence]) : toIso(toTime(date) + 7 * DAY));

export const isLive = (s: Subscription) => s.status === "active" || s.status === "late";

/** Every charge we expect from live subscriptions in [today, today + days). */
export function projectCharges(subs: readonly Subscription[], today: string, days: number): ExpectedCharge[] {
  const end = toIso(toTime(today) + days * DAY);
  const out: ExpectedCharge[] = [];
  for (const s of subs) {
    if (!isLive(s) || !s.nextCharge) continue;
    let d = s.nextCharge;
    while (d < today) d = advance(s, d);
    for (; d < end; d = advance(s, d)) {
      out.push({ date: d, key: s.key, name: s.name, amount: s.amount, currency: s.currency, slot: s.colorSlot });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}

export type Stats = {
  monthly: number;
  yearly: number;
  activeCount: number;
  lateCount: number;
  biggestIncrease: { name: string; from: number; to: number; pct: number; date: string; currency: string } | null;
  dueNext30: number;
};

export function computeStats(p: SubscriptionsPayload): Stats {
  const live = p.subscriptions.filter((s) => isLive(s) && s.currency === p.baseCurrency);
  const monthly = live.reduce((sum, s) => sum + s.monthlyCost, 0);
  const yearAgo = toIso(toTime(p.today) - 365 * DAY);
  let biggestIncrease: Stats["biggestIncrease"] = null;
  for (const s of p.subscriptions) {
    for (const pc of s.priceChanges) {
      if (pc.date < yearAgo || pc.to <= pc.from) continue;
      const pct = (pc.to - pc.from) / pc.from;
      if (!biggestIncrease || pct > biggestIncrease.pct) {
        biggestIncrease = { name: s.name, from: pc.from, to: pc.to, pct, date: pc.date, currency: s.currency };
      }
    }
  }
  const dueNext30 = projectCharges(live, p.today, 30).reduce((sum, c) => sum + c.amount, 0);
  return {
    monthly,
    yearly: monthly * 12,
    activeCount: live.filter((s) => s.status === "active").length,
    lateCount: live.filter((s) => s.status === "late").length,
    biggestIncrease,
    dueNext30,
  };
}

export type MerchantSpend = { merchantKey: Subscription["merchantKey"]; name: string; total: number };

/** Subscription spend per merchant over the last `months` months (plans of one merchant merged). */
export function spendByMerchant(p: SubscriptionsPayload, months = 12): MerchantSpend[] {
  const since = addMonths(p.today, -months);
  const by = new Map<string, MerchantSpend>();
  for (const s of p.subscriptions) {
    if (s.currency !== p.baseCurrency) continue;
    const total = s.charges.filter((c) => c.date > since).reduce((sum, c) => sum + c.amount, 0);
    if (total <= 0) continue;
    const name = s.name.split(" · ")[0];
    const cur = by.get(s.merchantKey);
    if (cur) cur.total += total;
    else by.set(s.merchantKey, { merchantKey: s.merchantKey, name, total });
  }
  return [...by.values()].map((m) => ({ ...m, total: Math.round(m.total * 100) / 100 }));
}
