import { isHexColor } from "../color";
import type { Cadence, Charge, HistoryPayload, PlanRenewal, PriceChange, SubStatus, Subscription } from "../types";
import { NO_COLOR_SLOT, type Override, type TxRow } from "./db";
import { isKnownSubscription, merchantCategory, merchantDomain, merchantName } from "./merchant";

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

export function median(xs: number[]): number {
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
export const sameAmount = (a: number, b: number) => Math.abs(a - b) <= Math.max(5, Math.abs(a) * 0.01);

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
export function clusterByAmount(txs: TxRow[]): TxRow[][] {
  const sorted = [...txs].sort((a, b) => a.amount_minor - b.amount_minor);
  const clusters: TxRow[][] = [];
  for (const t of sorted) {
    const last = clusters.at(-1);
    if (last && sameAmount(t.amount_minor, last[0].amount_minor)) last.push(t);
    else clusters.push([t]);
  }
  return clusters.map((c) => c.sort((a, b) => a.date.localeCompare(b.date)));
}

/** `pinned`: the user assigned these charges by hand, so they always form a subscription. */
function score(c: Candidate, today: string, override: Override | undefined, pinned = false): Subscription | null {
  const charges = toCharges(c.txs);
  const fit = fitCadence(charges.map((ch) => ch.date));
  const confirmed = pinned || override?.status === "confirmed";
  if (!fit && !confirmed) return null;

  const known = isKnownSubscription(c.merchantKey);
  const n = charges.length;
  // Unknown merchants need a longer track record before we believe they are recurring.
  const minCharges = fit?.cadence === "weekly" ? 4 : known ? 2 : 3;
  if (!confirmed && n < minCharges) return null;

  const stability = amountStability(charges.map((ch) => ch.amount));
  const confidence = Math.min(1, 0.45 * (fit?.fit ?? 0) + 0.35 * stability + 0.1 * Math.min(1, (n - 1) / 4) + (known ? 0.15 : 0));
  if (!confirmed && (confidence < 0.7 || (fit?.fit ?? 0) < 0.6)) return null;

  // The user's cadence beats the detected one; with neither (a lone hand-assigned charge), assume monthly.
  const chosen = override?.cadence ? PERIODS.find((p) => p.cadence === override.cadence) : undefined;
  // Plans billed side by side (Prime plus its ad-free add-on, kept as one subscription) each renew
  // on their own date, at the rhythm of one plan rather than of their charges mixed together.
  const plans = pricePlans(c.txs);
  const sides = plansOverlap(plans) ? plans : [];
  const period = chosen ??
    (sides.length ? fitCadence(datesOf(sides[0].txs)) : null) ??
    fit ?? { cadence: "monthly" as Cadence, days: 30.44, months: 1 };
  const after = (date: string) => (period.months ? addMonths(date, period.months) : toDate(toTime(date) + period.days * DAY));
  const grace = Math.max(3, period.days * 0.2);
  // A plan that has stopped (overdue like an inactive subscription) no longer renews or costs anything.
  const renewals = renewalsByDate(
    sides
      .map((p) => ({ amountMinor: p.amountMinor, nextCharge: after(datesOf(p.txs).at(-1) as string) }))
      .filter((r) => daysBetween(r.nextCharge, today) <= period.days * 0.75 + grace),
  );
  const last = charges[n - 1];
  const next = renewals[0]?.nextCharge ?? after(last.date);
  const daysLate = daysBetween(next, today);
  let status: SubStatus;
  if (override?.status === "cancelled") status = "cancelled";
  else if (daysLate <= grace) status = "active";
  else if (daysLate <= period.days * 0.75 + grace) status = "late";
  else status = "inactive";

  const amount = renewals.length ? renewals.reduce((sum, r) => sum + r.amount, 0) : last.amount;
  const monthlyCost = (amount * 30.4375) / period.days;
  return {
    key: c.key,
    merchantKey: c.merchantKey,
    name: override?.display_name || merchantName(c.merchantKey, c.txs[c.txs.length - 1].description),
    category: override?.category || merchantCategory(c.merchantKey),
    currency: c.currency,
    cadence: period.cadence,
    cadenceChosen: chosen !== undefined,
    periodDays: period.days,
    amount: round2(amount),
    monthlyCost: round2(monthlyCost),
    yearlyCost: round2(monthlyCost * 12),
    firstCharge: charges[0].date,
    lastCharge: last.date,
    nextCharge: status === "active" || status === "late" ? next : null,
    plans: (status === "active" || status === "late") && renewals.length > 1 ? renewals : [],
    chargeCount: n,
    totalSpent: round2(charges.reduce((s, ch) => s + ch.amount, 0)),
    status,
    confidence: round2(confidence),
    confirmed,
    pinned,
    known,
    ...overrideColor(override),
    website: override?.website || merchantDomain(c.merchantKey) || null,
    websiteChosen: Boolean(override?.website),
    group: override?.group_name || null,
    priceChanges: priceChanges(charges),
    charges,
    // Filled in from the reimbursement periods by applyReimbursements (reimburse.ts).
    reimbursement: null,
    reimbursementPeriods: [],
    netMonthlyCost: round2(monthlyCost),
    totalReimbursed: 0,
    pendingReimbursements: 0,
  };
}

/** Plans' next charges, those on the same day as one (in major units), earliest first. */
function renewalsByDate(plans: { amountMinor: number; nextCharge: string }[]): PlanRenewal[] {
  const byDate = new Map<string, number>();
  for (const p of plans) byDate.set(p.nextCharge, (byDate.get(p.nextCharge) ?? 0) + p.amountMinor);
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([nextCharge, minor]) => ({ amount: minor / 100, nextCharge }));
}

export type Detection = { subscriptions: Subscription[]; ignored: Subscription[]; txToSub: Map<string, string> };

/**
 * Which website a payment's logo comes from: its subscription's, else one the user set on any
 * subscription of the same merchant (so one-off payments match), else the built-in one.
 */
export function websiteResolver(det: Detection): (merchantKey: string, subKey: string | null) => string | null {
  const bySub = new Map<string, string | null>();
  const byMerchant = new Map<string, string>();
  for (const s of [...det.subscriptions, ...det.ignored]) {
    bySub.set(s.key, s.website);
    if (s.websiteChosen && s.website && !byMerchant.has(s.merchantKey)) byMerchant.set(s.merchantKey, s.website);
  }
  return (merchantKey, subKey) => (subKey && bySub.get(subKey)) || byMerchant.get(merchantKey) || merchantDomain(merchantKey) || null;
}

export const MAX_SERIES = 7;

/** The colour a user picked: a custom hex wins, slot `NO_COLOR_SLOT` means "none" (neutral grey). */
function overrideColor(o: Override | undefined): Pick<Subscription, "color" | "colorChosen"> {
  if (isHexColor(o?.color_hex)) return { color: o.color_hex, colorChosen: true };
  if (o?.color_slot != null) return { color: o.color_slot === NO_COLOR_SLOT ? null : o.color_slot, colorChosen: true };
  return { color: null, colorChosen: false };
}

/**
 * Subscriptions the user picked a colour for keep it. The biggest (all-time spend) of the rest
 * fill the remaining slots 1–7, numbered by first-seen date. Neither depends on a chart's date
 * filter, so survivors never repaint.
 */
export function assignColorSlots(subs: Subscription[], baseCurrency: string): void {
  const taken = new Set(subs.filter((s) => s.colorChosen).map((s) => s.color));
  const free = Array.from({ length: MAX_SERIES }, (_, i) => i + 1).filter((slot) => !taken.has(slot));
  const auto = subs.filter((s) => !s.colorChosen);
  const top = auto
    .filter((s) => s.currency === baseCurrency)
    .sort((a, b) => b.totalSpent - a.totalSpent || a.key.localeCompare(b.key))
    .slice(0, free.length)
    .sort((a, b) => a.firstCharge.localeCompare(b.firstCharge) || a.key.localeCompare(b.key));
  for (const s of auto) s.color = null;
  top.forEach((s, i) => {
    s.color = free[i];
  });
}

type Found = { sub: Subscription; txs: TxRow[] };

/**
 * Whether two plans (their sorted charge dates) bill side by side: each has at least two billing
 * periods that overlap the other plan's active span. A charge's period runs to the next charge, the
 * last one's for a typical gap; a plan is active from its first charge to the end of its last period.
 * So Jan 12/Feb 12 next to Jan 14/Feb 14 is parallel, while a price change (the old price stops as
 * the new one starts) or a switch with one month of overlap is not.
 */
export function runInParallel(a: readonly string[], b: readonly string[]): boolean {
  const periods = (dates: readonly string[]) => {
    const times = dates.map(toTime);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    const typical = gaps.length ? median(gaps) : 30.44 * DAY;
    return times.map((from, i) => ({ from, to: times[i + 1] ?? from + typical }));
  };
  const pa = periods(a);
  const pb = periods(b);
  const span = (ps: { from: number; to: number }[]) => ({ from: ps[0].from, to: ps[ps.length - 1].to });
  const overlapping = (ps: { from: number; to: number }[], s: { from: number; to: number }) =>
    ps.filter((p) => p.from < s.to && p.to > s.from).length;
  return pa.length > 0 && pb.length > 0 && overlapping(pa, span(pb)) >= 2 && overlapping(pb, span(pa)) >= 2;
}

/**
 * Price points (each charged at least twice) joined into plans: a point whose first charge lands
 * when another's next charge was due (about one billing period after its last) continues that plan
 * as a price change; the rest are plans of their own. Points come in any order; each chain is
 * oldest price first.
 */
export function chainPricePoints<T extends { dates: readonly string[]; amountMinor: number }>(points: readonly T[]): T[][] {
  const chains: T[][] = [];
  for (const p of [...points].sort((a, b) => a.dates[0].localeCompare(b.dates[0]))) {
    const gapOk = (chain: T[]) => {
      const last = chain[chain.length - 1];
      const gap = daysBetween(last.dates[last.dates.length - 1], p.dates[0]);
      const period = daysBetween(last.dates[0], last.dates[last.dates.length - 1]) / (last.dates.length - 1);
      return gap >= period * 0.5 && gap <= period * 1.5;
    };
    const distance = (chain: T[]) => Math.abs(chain[chain.length - 1].amountMinor - p.amountMinor);
    const into = chains.filter(gapOk).sort((a, b) => distance(a) - distance(b))[0];
    if (into) into.push(p);
    else chains.push([p]);
  }
  return chains;
}

export type Plan = { amountMinor: number; txs: TxRow[] };

const datesOf = (txs: TxRow[]) => [...new Set(txs.map((t) => t.date))].sort();

/**
 * A subscription's charges grouped into the plans billed side by side, for "Split by price". Every
 * price paid at least twice is a price point, and a price change continues its plan (see
 * `chainPricePoints`). One-off prices belong to no plan, so they can't become a plan's latest
 * charge (its price, and what its renewals are matched against). Fewer than two plans means there
 * is nothing to split. Plans come most expensive first, priced at their latest charge.
 */
export function pricePlans(members: TxRow[]): Plan[] {
  const points = clusterByAmount(members)
    .filter((c) => c.length >= 2)
    .map((txs) => ({ txs, dates: datesOf(txs), amountMinor: Math.round(-median(txs.map((t) => t.amount_minor))) }));
  const chains = chainPricePoints(points);
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

/** Any two of the price points bill side by side (see `runInParallel`). */
function hasParallelPlans(parts: Found[]): boolean {
  const dates = parts.map((p) => p.sub.charges.map((c) => c.date));
  return dates.some((a, i) => dates.slice(i + 1).some((b) => runInParallel(a, b)));
}

/** Automatic detection over charges nobody assigned by hand, one merchant + currency at a time. */
function autoDetect(pool: TxRow[], overrides: Map<string, Override>, today: string): Found[] {
  const groups = new Map<string, TxRow[]>();
  for (const t of pool) {
    const key = `${t.merchant_key}|${t.currency}`;
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }

  const found: Found[] = [];
  for (const [groupKey, group] of groups) {
    group.sort((a, b) => a.date.localeCompare(b.date));
    const [merchantKey, currency] = groupKey.split("|");

    // 1) The whole merchant as one subscription (handles price changes well). A merchant the user
    //    confirmed, cancelled or ignored stays whole even when its charges would also split into
    //    price points, so that decision keeps applying.
    const whole = score({ key: groupKey, merchantKey, currency, txs: group }, today, overrides.get(groupKey));
    if (whole && (whole.confirmed || overrides.get(groupKey)?.status)) {
      found.push({ sub: whole, txs: group });
      continue;
    }
    // 2) Several plans at different price points (Apple, or Prime plus its ad-free add-on).
    const points = clusterByAmount(group)
      .filter((cluster) => cluster.length >= 2)
      .map((txs) => ({
        txs,
        dates: toCharges(txs).map((c) => c.date),
        amountMinor: Math.round(-median(txs.map((t) => t.amount_minor))),
      }));
    const part = (txs: TxRow[], amountMinor: number): Found | null => {
      const key = `${groupKey}|${amountMinor}`;
      const sub = score({ key, merchantKey, currency, txs }, today, overrides.get(key));
      return sub ? { sub, txs } : null;
    };
    let parts = points.flatMap((p) => part(p.txs, p.amountMinor) ?? []);
    // The whole wins unless the price points bill side by side: several rows per payment day, or
    // two plans that each keep renewing over the same stretch of time (a price change doesn't).
    const manySameDayish = whole !== null && group.length > whole.chargeCount + 1;
    if (whole && !manySameDayish) {
      if (!hasParallelPlans(parts)) {
        found.push({ sub: whole, txs: group });
        continue;
      }
      // Plans billed side by side: a price change within one of them stays one subscription,
      // keyed by its first price so the key survives later changes.
      parts = chainPricePoints(points).flatMap((chain) => {
        const txs = chain.flatMap((p) => p.txs).sort((a, b) => a.date.localeCompare(b.date));
        return part(txs, chain[0].amountMinor) ?? [];
      });
    }
    if (parts.length) {
      if (parts.length > 1) for (const p of parts) p.sub.name = `${p.sub.name} · ${p.sub.amount.toFixed(2)}`;
      found.push(...parts);
    } else if (whole) {
      found.push({ sub: whole, txs: group });
    }
  }
  return found;
}

/** `merchant|currency[|…]` → its merchant key and currency. */
export function parseSubKey(key: string): { merchantKey: string; currency: string } {
  const [merchantKey = "", currency = ""] = key.split("|");
  return { merchantKey, currency };
}

/**
 * New charges keep flowing into a pinned subscription: an unassigned payment day from one of its
 * merchants, dated after its latest charge and at the same price, continues it. Prices compare
 * per day (like `toCharges`), so a renewal split over two same-day rows still matches; failing
 * that, single rows priced like the subscription join on their own. A charge that would fit
 * several pinned subscriptions is left alone rather than guessed. Returns the unclaimed rows.
 */
function followPinned(pinned: Map<string, TxRow[]>, pool: TxRow[]): TxRow[] {
  const dayTotal = (rows: TxRow[], date: string) => rows.reduce((s, t) => s + (t.date === date ? t.amount_minor : 0), 0);
  const heads = [...pinned].map(([key, list]) => {
    const { merchantKey, currency } = parseSubKey(key);
    const date = list.reduce((d, t) => (t.date > d ? t.date : d), "");
    return { list, currency, merchants: new Set([merchantKey, ...list.map((t) => t.merchant_key)]), date, amount: dayTotal(list, date) };
  });
  if (!heads.length) return pool;

  // One payment day per merchant + currency, oldest first.
  const days = new Map<string, TxRow[]>();
  for (const t of pool) {
    const k = `${t.date}|${t.merchant_key}|${t.currency}`;
    const day = days.get(k);
    if (day) day.push(t);
    else days.set(k, [t]);
  }
  const rest: TxRow[] = [];
  for (const k of [...days.keys()].sort()) {
    const rows = days.get(k) as TxRow[];
    const { date, merchant_key, currency } = rows[0];
    const open = heads.filter((h) => h.currency === currency && h.merchants.has(merchant_key) && date > h.date);
    const only = <T>(xs: T[]) => (xs.length === 1 ? xs[0] : undefined);
    const total = rows.reduce((s, t) => s + t.amount_minor, 0);
    const whole = only(open.filter((h) => sameAmount(total, h.amount)));
    if (whole) {
      whole.list.push(...rows);
      whole.date = date;
      whole.amount = total;
      continue;
    }
    // The day also holds other purchases: take just the rows priced like a subscription.
    for (const t of rows) {
      const head = only(open.filter((h) => sameAmount(t.amount_minor, h.amount)));
      if (head) head.list.push(t);
      else rest.push(t);
    }
    for (const h of open) if (h.list.at(-1)?.date === date) h.date = date;
  }
  return rest;
}

export function detectSubscriptions(
  txs: TxRow[],
  overrides: Map<string, Override>,
  today: string,
  baseCurrency = "EUR",
  /** Transaction ids the user removed from subscriptions; never counted as charges. */
  excluded: ReadonlySet<string> = new Set(),
  /**
   * Transaction id → the subscription key the user put it in. Beats detection; an exclusion still
   * wins, and keeping the assignment underneath is what lets "Include again" restore it.
   */
  assigned: ReadonlyMap<string, string> = new Map(),
): Detection {
  // Assigned charges form "pinned" subscriptions whatever their type (a direct debit can come
  // through as a transfer) and whether or not they fit a pattern.
  const pinned = new Map<string, TxRow[]>();
  for (const t of txs) {
    const key = assigned.get(t.id);
    if (key === undefined || t.amount_minor >= 0 || excluded.has(t.id)) continue;
    const list = pinned.get(key);
    if (list) list.push(t);
    else pinned.set(key, [t]);
  }
  // Renewals continue a pinned subscription before type rules apply (its direct debits are
  // transfers too); only what's left goes through automatic detection.
  const pool = followPinned(
    pinned,
    txs.filter((t) => t.amount_minor < 0 && !excluded.has(t.id) && !assigned.has(t.id)),
  ).filter(isSpend);

  const found: Subscription[] = [];
  const txToSub = new Map<string, string>();
  for (const f of autoDetect(pool, overrides, today)) {
    // Detection landed on a pinned key (e.g. new charges at a new price): fold them in. A lone
    // charge only "detected" because the key is confirmed (a one-off left over after a split)
    // stays out, so it can't become the pinned subscription's latest price.
    const into = pinned.get(f.sub.key);
    if (into) {
      if (f.sub.chargeCount >= 2) into.push(...f.txs);
      continue;
    }
    found.push(f.sub);
    for (const t of f.txs) txToSub.set(t.id, f.sub.key);
  }
  for (const [key, list] of pinned) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const sub = score({ key, ...parseSubKey(key), txs: list }, today, overrides.get(key), true);
    if (!sub) continue;
    found.push(sub);
    for (const t of list) txToSub.set(t.id, key);
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
    const subKey = detection.txToSub.get(t.id);
    // A charge the user assigned counts even if its type is normally excluded (e.g. a transfer).
    if (t.currency !== baseCurrency || !(isSpend(t) || subKey)) continue;
    const i = idx.get(t.date.slice(0, 7));
    if (i === undefined) continue;
    allSpending[i] += -t.amount_minor / 100;
    const row = subKey ? perSub.get(subKey) : undefined;
    if (row) row[i] += -t.amount_minor / 100;
  }
  const valuesOf = (key: string) => perSub.get(key) ?? [];
  // Recorded + assumed reimbursements, by the date of the charge they pay back.
  const reimbursed = new Array<number>(months.length).fill(0);
  for (const s of subs) {
    for (const ch of s.charges) {
      const r = ch.reimbursement;
      const i = idx.get(ch.date.slice(0, 7));
      if (i !== undefined && (r?.status === "recorded" || r?.status === "assumed")) reimbursed[i] += r.amount;
    }
  }

  // Coloured subscriptions keep their own series (even if empty in this window, so the
  // legend and colours stay put); everything else folds into "Other".
  // Palette slots first, in slot order; then custom colours, by first-seen date.
  const order = (s: Subscription) => (typeof s.color === "number" ? s.color : Number.POSITIVE_INFINITY);
  const coloured = subs
    .filter((s) => s.color !== null)
    .sort((a, b) => order(a) - order(b) || a.firstCharge.localeCompare(b.firstCharge) || a.key.localeCompare(b.key));
  const rest = subs.filter((s) => s.color === null && valuesOf(s.key).some((v) => v > 0));
  const series: HistoryPayload["series"] = coloured.map((s) => ({
    key: s.key,
    name: s.name,
    color: s.color,
    values: valuesOf(s.key).map(round2),
  }));
  if (rest.length) {
    series.push({
      key: "__other",
      name: `Other (${rest.length})`,
      color: null,
      values: months.map((_, i) => round2(rest.reduce((sum, r) => sum + valuesOf(r.key)[i], 0))),
    });
  }
  return {
    baseCurrency,
    months,
    series,
    totals: months.map((_, i) => round2(series.reduce((s, r) => s + r.values[i], 0))),
    allSpending: allSpending.map(round2),
    reimbursed: reimbursed.map(round2),
  };
}
