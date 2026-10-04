import type { Cadence, Charge, HistoryPayload, PriceChange, SubStatus, Subscription } from "../types";
import type { Override, TxRow } from "./db";
import { isKnownSubscription, merchantCategory, merchantName } from "./merchant";

// Statement rows that are never subscriptions (moving your own money around).
const EXCLUDED_TYPES = new Set(["TOPUP", "EXCHANGE", "TRANSFER", "ATM", "CARD_REFUND", "REFUND", "REWARD", "CASHBACK", "INTEREST"]);

const PERIODS: { cadence: Cadence; days: number; tol: number; months: number }[] = [
  { cadence: "weekly", days: 7, tol: 1.5, months: 0 },
  { cadence: "monthly", days: 30.44, tol: 4, months: 1 },
  { cadence: "quarterly", days: 91.31, tol: 8, months: 3 },
  { cadence: "semiannual", days: 182.62, tol: 12, months: 6 },
  { cadence: "yearly", days: 365.25, tol: 15, months: 12 },
];

const DAY = 86_400_000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toDate = (t: number) => new Date(t).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((toTime(b) - toTime(a)) / DAY);
const round2 = (n: number) => Math.round(n * 100) / 100;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function addMonths(date: string, months: number): string {
  const d = new Date(toTime(date));
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return toDate(d.getTime());
}

export function isSpend(tx: TxRow): boolean {
  return tx.amount_minor < 0 && !(tx.type && EXCLUDED_TYPES.has(tx.type));
}

type Fit = { cadence: Cadence; days: number; months: number; fit: number };

export function fitCadence(dates: string[]): Fit | null {
  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) intervals.push(daysBetween(dates[i - 1], dates[i]));
  if (!intervals.length) return null;
  const med = median(intervals);
  const p = PERIODS.find((p) => Math.abs(med - p.days) <= p.tol);
  if (!p) return null;
  // An interval that is a clean multiple (a missed/failed month) still counts as on-cadence.
  const ok = intervals.filter((iv) => {
    const k = Math.max(1, Math.round(iv / p.days));
    return k <= 3 && Math.abs(iv - k * p.days) <= p.tol * k;
  }).length;
  return { cadence: p.cadence, days: p.days, months: p.months, fit: ok / intervals.length };
}

/** Amounts equal within 1% (or 5 cents) — rounding and FX noise, not a price change. */
const sameAmount = (a: number, b: number) => Math.abs(a - b) <= Math.max(5, Math.abs(a) * 0.01);

/** Share of consecutive charges with (nearly) the same amount. Tolerates a one-off price change. */
export function amountStability(amounts: number[]): number {
  if (amounts.length < 2) return 1;
  let same = 0;
  for (let i = 1; i < amounts.length; i++) {
    const a = amounts[i - 1];
    const b = amounts[i];
    if (sameAmount(a, b)) same++;
  }
  return same / (amounts.length - 1);
}

function priceChanges(charges: Charge[]): PriceChange[] {
  const out: PriceChange[] = [];
  for (let i = 1; i < charges.length; i++) {
    const prev = Math.round(charges[i - 1].amount * 100);
    const cur = Math.round(charges[i].amount * 100);
    const next = charges[i + 1] ? Math.round(charges[i + 1].amount * 100) : cur;
    // Only a *persistent* change counts; a one-off surcharge that reverts is not a new price.
    const before = charges[i - 2] ? Math.round(charges[i - 2].amount * 100) : null;
    const revertsBlip = before !== null && sameAmount(cur, before); // back to the old price after a one-off
    if (!sameAmount(prev, cur) && sameAmount(cur, next) && !revertsBlip)
      out.push({ date: charges[i].date, from: prev / 100, to: cur / 100 });
  }
  return out;
}

/** Collapse same-day duplicates (e.g. a charge + its fee line) into one charge. */
function toCharges(txs: TxRow[]): Charge[] {
  const byDate = new Map<string, number>();
  for (const t of txs) byDate.set(t.date, (byDate.get(t.date) ?? 0) + -t.amount_minor);
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, minor]) => ({ date, amount: minor / 100 }));
}

type Candidate = { key: string; merchantKey: string; currency: string; txs: TxRow[] };

/** Split a merchant's charges into clusters of similar amounts (Apple bills several plans under one name). */
function clusterByAmount(txs: TxRow[]): TxRow[][] {
  const sorted = [...txs].sort((a, b) => a.amount_minor - b.amount_minor);
  const clusters: TxRow[][] = [];
  for (const t of sorted) {
    const last = clusters.at(-1);
    if (last && sameAmount(t.amount_minor, last[0].amount_minor)) last.push(t);
    else clusters.push([t]);
  }
  return clusters.map((c) => c.sort((a, b) => a.date.localeCompare(b.date)));
}

function score(c: Candidate, today: string, override: Override | undefined): Subscription | null {
  const charges = toCharges(c.txs);
  const fit = fitCadence(charges.map((ch) => ch.date));
  const confirmed = override?.status === "confirmed";
  if (!fit && !confirmed) return null;

  const known = isKnownSubscription(c.merchantKey);
  const n = charges.length;
  // Unknown merchants need a longer track record before we believe they are recurring.
  const minCharges = fit?.cadence === "weekly" ? 4 : known ? 2 : 3;
  if (!confirmed && n < minCharges) return null;

  const stability = amountStability(charges.map((ch) => ch.amount));
  const confidence = Math.min(1, 0.45 * (fit?.fit ?? 0) + 0.35 * stability + 0.1 * Math.min(1, (n - 1) / 4) + (known ? 0.15 : 0));
  if (!confirmed && (confidence < 0.7 || (fit?.fit ?? 0) < 0.6)) return null;

  const period = fit ?? { cadence: "monthly" as Cadence, days: 30.44, months: 1, fit: 0 };
  const last = charges[n - 1];
  const next = period.months ? addMonths(last.date, period.months) : toDate(toTime(last.date) + period.days * DAY);
  const daysLate = daysBetween(next, today);
  const grace = Math.max(3, period.days * 0.2);
  let status: SubStatus;
  if (override?.status === "cancelled") status = "cancelled";
  else if (daysLate <= grace) status = "active";
  else if (daysLate <= period.days * 0.75 + grace) status = "late";
  else status = "inactive";

  const amount = last.amount;
  const monthlyCost = (amount * 30.4375) / period.days;
  return {
    key: c.key,
    merchantKey: c.merchantKey,
    name: override?.display_name || merchantName(c.merchantKey, c.txs[c.txs.length - 1].description),
    category: override?.category || merchantCategory(c.merchantKey),
    currency: c.currency,
    cadence: period.cadence,
    periodDays: period.days,
    amount: round2(amount),
    monthlyCost: round2(monthlyCost),
    yearlyCost: round2(monthlyCost * 12),
    firstCharge: charges[0].date,
    lastCharge: last.date,
    nextCharge: status === "active" || status === "late" ? next : null,
    chargeCount: n,
    totalSpent: round2(charges.reduce((s, ch) => s + ch.amount, 0)),
    status,
    confidence: round2(confidence),
    confirmed,
    known,
    colorSlot: override?.color_slot ?? null,
    colorChosen: override?.color_slot != null,
    priceChanges: priceChanges(charges),
    charges,
  };
}

export type Detection = { subscriptions: Subscription[]; ignored: Subscription[]; txToSub: Map<string, string> };

export const MAX_SERIES = 7;
/** Preset colours a user can pick from (`--series-1` … `--series-8`). */
export const COLOR_SLOTS = 8;

/**
 * Subscriptions the user picked a colour for keep it. The biggest (all-time spend) of the rest
 * fill the remaining slots 1–7, numbered by first-seen date. Neither depends on a chart's date
 * filter, so survivors never repaint.
 */
export function assignColorSlots(subs: Subscription[], baseCurrency: string): void {
  const taken = new Set(subs.filter((s) => s.colorChosen).map((s) => s.colorSlot));
  const free = Array.from({ length: MAX_SERIES }, (_, i) => i + 1).filter((slot) => !taken.has(slot));
  const auto = subs.filter((s) => !s.colorChosen);
  const top = auto
    .filter((s) => s.currency === baseCurrency)
    .sort((a, b) => b.totalSpent - a.totalSpent || a.key.localeCompare(b.key))
    .slice(0, free.length)
    .sort((a, b) => a.firstCharge.localeCompare(b.firstCharge) || a.key.localeCompare(b.key));
  for (const s of auto) s.colorSlot = null;
  top.forEach((s, i) => {
    s.colorSlot = free[i];
  });
}

export function detectSubscriptions(
  txs: TxRow[],
  overrides: Map<string, Override>,
  today: string,
  baseCurrency = "EUR",
  /** Transaction ids the user removed from subscriptions; never counted as charges. */
  excluded: ReadonlySet<string> = new Set(),
): Detection {
  const groups = new Map<string, TxRow[]>();
  for (const t of txs) {
    if (!isSpend(t) || excluded.has(t.id)) continue;
    const key = `${t.merchant_key}|${t.currency}`;
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }

  const found: Subscription[] = [];
  const txToSub = new Map<string, string>();
  for (const [groupKey, group] of groups) {
    group.sort((a, b) => a.date.localeCompare(b.date));
    const [merchantKey, currency] = groupKey.split("|");

    // 1) The whole merchant as one subscription (handles price changes well).
    const whole = score({ key: groupKey, merchantKey, currency, txs: group }, today, overrides.get(groupKey));
    const charges = whole ? whole.chargeCount : 0;
    const manySameDayish = group.length > charges + 1;
    if (whole && !manySameDayish) {
      found.push(whole);
      for (const t of group) txToSub.set(t.id, whole.key);
      continue;
    }
    // 2) Otherwise look for several plans at different price points.
    const parts: Subscription[] = [];
    for (const cluster of clusterByAmount(group)) {
      if (cluster.length < 2) continue;
      const mid = Math.round(-median(cluster.map((t) => t.amount_minor)));
      const key = `${groupKey}|${mid}`;
      const sub = score({ key, merchantKey, currency, txs: cluster }, today, overrides.get(key));
      if (sub) {
        parts.push(sub);
        for (const t of cluster) txToSub.set(t.id, sub.key);
      }
    }
    if (parts.length) {
      if (parts.length > 1) for (const p of parts) p.name = `${p.name} · ${p.amount.toFixed(2)}`;
      found.push(...parts);
    } else if (whole) {
      found.push(whole);
      for (const t of group) txToSub.set(t.id, whole.key);
    }
  }

  const order: Record<SubStatus, number> = { active: 0, late: 1, inactive: 2, cancelled: 3 };
  found.sort((a, b) => order[a.status] - order[b.status] || b.monthlyCost - a.monthlyCost);
  const isIgnored = (s: Subscription) => overrides.get(s.key)?.status === "ignored";
  for (const s of found.filter(isIgnored)) for (const [id, k] of txToSub) if (k === s.key) txToSub.delete(id);
  const subscriptions = found.filter((s) => !isIgnored(s));
  assignColorSlots(subscriptions, baseCurrency);
  return { subscriptions, ignored: found.filter(isIgnored), txToSub };
}

export function buildHistory(txs: TxRow[], detection: Detection, baseCurrency: string, today: string, monthsBack = 12): HistoryPayload {
  const months: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) months.push(addMonths(`${today.slice(0, 7)}-01`, -i).slice(0, 7));
  const idx = new Map(months.map((m, i) => [m, i]));

  const subs = detection.subscriptions.filter((s) => s.currency === baseCurrency);
  const perSub = new Map(subs.map((s) => [s.key, new Array<number>(months.length).fill(0)]));
  const allSpending = new Array<number>(months.length).fill(0);
  for (const t of txs) {
    if (t.currency !== baseCurrency || !isSpend(t)) continue;
    const i = idx.get(t.date.slice(0, 7));
    if (i === undefined) continue;
    allSpending[i] += -t.amount_minor / 100;
    const subKey = detection.txToSub.get(t.id);
    const row = subKey ? perSub.get(subKey) : undefined;
    if (row) row[i] += -t.amount_minor / 100;
  }
  const valuesOf = (key: string) => perSub.get(key) ?? [];

  // Slotted subscriptions keep their own series (even if empty in this window, so the
  // legend and colours stay put); everything else folds into "Other".
  const slotted = subs.filter((s) => s.colorSlot !== null).sort((a, b) => (a.colorSlot ?? 0) - (b.colorSlot ?? 0));
  const rest = subs.filter((s) => s.colorSlot === null && valuesOf(s.key).some((v) => v > 0));
  const series: HistoryPayload["series"] = slotted.map((s) => ({
    key: s.key,
    name: s.name,
    slot: s.colorSlot,
    values: valuesOf(s.key).map(round2),
  }));
  if (rest.length) {
    series.push({
      key: "__other",
      name: `Other (${rest.length})`,
      slot: null,
      values: months.map((_, i) => round2(rest.reduce((sum, r) => sum + valuesOf(r.key)[i], 0))),
    });
  }
  return {
    baseCurrency,
    months,
    series,
    totals: months.map((_, i) => round2(series.reduce((s, r) => s + r.values[i], 0))),
    allSpending: allSpending.map(round2),
  };
}
