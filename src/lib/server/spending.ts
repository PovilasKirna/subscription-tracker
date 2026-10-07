import { CATEGORIES, type CategoryId } from "../categories";
import { isLive, projectChargesBetween } from "../insights";
import type { SpendingCategory, SpendingPayload, SpendingPoint, SpendingRange, Subscription } from "../types";
import { flowOf } from "./categorize";
import type { TxRow } from "./db";

// The Spending page for one period (a week, a month, 6 months or a year): spending and income by
// category, the running total against the period before, and (for the current month) where it's
// heading. Pure; base currency only.

const DAY = 86_400_000;
const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
const isoDate = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (date: string, n: number) => isoDate(time(date) + n * DAY);
const round2 = (n: number) => Math.round(n * 100) / 100;
const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const lastOf = (month: string) => `${month}-${String(daysIn(month)).padStart(2, "0")}`;

export function shiftMonth(month: string, by: number): string {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** How many complete months before the current one the projection learns the month's rhythm from. */
const PACE_MONTHS = 3;
const MONTHS_IN: Record<SpendingRange, number> = { "1w": 0, "1m": 1, "6m": 6, "1y": 12 };

type Period = { start: string; end: string; unit: "day" | "month"; keys: string[] };

/**
 * The period of `range` holding `at`: a week (Monday to Sunday), a calendar month, the 6 months
 * ending with `at`'s month, or a calendar year. Pure.
 */
export function periodOf(range: SpendingRange, at: string): Period {
  if (range === "1y") {
    const year = at.slice(0, 4);
    const keys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
    return { start: `${year}-01-01`, end: `${year}-12-31`, unit: "month", keys };
  }
  if (range === "1w") {
    const start = addDays(at, -((new Date(time(at)).getUTCDay() + 6) % 7));
    const keys = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return { start, end: keys[6], unit: "day", keys };
  }
  if (range === "1m") {
    const month = at.slice(0, 7);
    const keys = Array.from({ length: daysIn(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
    return { start: keys[0], end: keys.at(-1) as string, unit: "day", keys };
  }
  const n = MONTHS_IN[range];
  const last = at.slice(0, 7);
  const keys = Array.from({ length: n }, (_, i) => shiftMonth(last, i - n + 1));
  return { start: `${keys[0]}-01`, end: lastOf(last), unit: "month", keys };
}

/** The same-length period just before (the week, month, 6 months or year before). */
export function previousPeriod(range: SpendingRange, p: Period): Period {
  return periodOf(range, range === "1w" ? addDays(p.start, -7) : addDays(p.start, -1));
}

type Rec = { date: string; category: CategoryId; spent: number; earned: number };

export function buildSpending(input: {
  txs: readonly TxRow[];
  categoryOf: ReadonlyMap<string, CategoryId>;
  subscriptions: readonly Subscription[];
  base: string;
  range: SpendingRange;
  /** Any date inside the period (YYYY-MM-DD, or YYYY-MM); anything else or in the future = today. */
  at: string;
  today: string;
}): SpendingPayload {
  const { base, today, range } = input;
  const at = /^\d{4}-\d{2}(-\d{2})?$/.test(input.at) ? (input.at.length === 7 ? `${input.at}-01` : input.at) : today;
  const period = periodOf(range, at > today ? today : at);
  const prev = previousPeriod(range, period);
  const isCurrent = period.start <= today && today <= period.end;
  const cutoff = isCurrent ? today : period.end;

  // Every payment's effect, once.
  const recs: Rec[] = [];
  const other = new Set<string>();
  let firstDate: string | null = null;
  for (const tx of input.txs) {
    if (!firstDate || tx.date < firstDate) firstDate = tx.date;
    if (tx.currency !== base) {
      other.add(tx.currency);
      continue;
    }
    const category = input.categoryOf.get(tx.id) ?? "general";
    const { spent, earned } = flowOf(tx, category);
    if (spent || earned) recs.push({ date: tx.date, category, spent, earned });
  }

  const bucket = (p: Period, date: string) => (p.unit === "day" ? date : date.slice(0, 7));
  const sumBy = (p: Period, until: string) => {
    const out = new Map<string, number>(p.keys.map((k) => [k, 0]));
    for (const r of recs) {
      if (r.date < p.start || r.date > until) continue;
      const k = bucket(p, r.date);
      out.set(k, (out.get(k) ?? 0) + r.spent);
    }
    return out;
  };
  const curSpent = sumBy(period, cutoff);
  const prevSpent = sumBy(prev, prev.end);
  /** Whether a point of the current period has started (a day or month not in the future). */
  const reached = (k: string) => k <= bucket(period, cutoff);

  // Projection (any current period): what's spent, plus what's still to come.
  // - Days left (up to the end of a week, or of the current month): what you usually spend on that
  //   day of the month (the average of the last few months, outside subscriptions), plus each
  //   subscription on its due day. Day by day, so rent already paid isn't counted again and the line
  //   follows your rhythm instead of running straight.
  // - Months still to come (6M, 1Y): your usual month (the same months' average, everything included).
  const projecting = isCurrent && today < period.end;
  const expected = new Map<string, number>();
  let upcomingSubscriptions = 0;
  let monthRemainder = 0; // the rest of the current month, for month-by-month periods
  let usualMonth = 0;
  if (projecting) {
    const currentMonth = today.slice(0, 7);
    const dailyEnd = period.unit === "day" ? period.end : lastOf(currentMonth);
    const due = projectChargesBetween(
      input.subscriptions.filter((s) => isLive(s) && s.currency === base),
      addDays(today, 1),
      addDays(dailyEnd, 1),
    );
    for (const c of due) {
      const amount = Math.round(c.amount * 100);
      expected.set(c.date, (expected.get(c.date) ?? 0) + amount);
      upcomingSubscriptions += amount;
    }
    const paceMonths = Array.from({ length: PACE_MONTHS }, (_, i) => shiftMonth(currentMonth, -1 - i));
    const paceUsed = paceMonths.filter((m) => recs.some((r) => r.date.startsWith(m)));
    if (paceUsed.length) {
      const usualDay = new Array<number>(32).fill(0);
      for (const r of recs) {
        if (!paceUsed.includes(r.date.slice(0, 7))) continue;
        usualMonth += r.spent;
        if (r.category !== "subscriptions") usualDay[Number(r.date.slice(8, 10))] += r.spent;
      }
      usualMonth = Math.max(0, Math.round(usualMonth / paceUsed.length));
      for (let date = addDays(today, 1); date <= dailyEnd; date = addDays(date, 1)) {
        const avg = Math.max(0, Math.round(usualDay[Number(date.slice(8, 10))] / paceUsed.length));
        expected.set(date, (expected.get(date) ?? 0) + avg);
      }
    }
    if (period.unit === "month") {
      for (const [date, v] of expected) if (date.startsWith(currentMonth)) monthRemainder += v;
    }
  }
  /** What's expected at a point still to come: a day's expectation, or a usual month. */
  const expectedAt = (k: string) => (period.unit === "day" ? (expected.get(k) ?? 0) : usualMonth);

  const points: SpendingPoint[] = [];
  let run = 0;
  let prevRun = 0;
  let proj = 0;
  let pending = 0; // the current month's remainder, added on the way to the next month
  const lastReached = period.keys.filter(reached).at(-1);
  period.keys.forEach((k, i) => {
    const prevKey = prev.keys[i];
    if (reached(k)) run += curSpent.get(k) ?? 0;
    if (prevKey !== undefined) prevRun += prevSpent.get(prevKey) ?? 0;
    if (k === lastReached) {
      proj = run;
      pending = monthRemainder;
    } else if (projecting && !reached(k)) {
      proj += pending + expectedAt(k);
      pending = 0;
    }
    points.push({
      key: k,
      spent: reached(k) ? run / 100 : null,
      previous: prevKey !== undefined ? prevRun / 100 : null,
      projected: projecting && (k === lastReached || !reached(k)) ? round2(proj / 100) : null,
      amount: reached(k) ? (curSpent.get(k) ?? 0) / 100 : null,
      previousAmount: prevKey !== undefined ? (prevSpent.get(prevKey) ?? 0) / 100 : null,
      projectedAmount: projecting && !reached(k) ? expectedAt(k) / 100 : null,
    });
  });
  // A period ending with the current month (6M) still expects the rest of this month.
  const projectedTotal = proj + pending;
  const lastIndex = lastReached ? period.keys.indexOf(lastReached) : -1;
  // The whole previous period, even when it has more days than this one (31 days before a 30-day month).
  const previousTotal = [...prevSpent.values()].reduce((s, v) => s + v, 0);
  const comparable = isCurrent ? Math.round((points[lastIndex]?.previous ?? 0) * 100) : previousTotal;

  // Categories and income over the period (to today) against the whole period before.
  const tally = (p: Period, until: string) => {
    const byCategory = new Map<CategoryId, { amount: number; count: number }>();
    let spentTotal = 0;
    let earnedTotal = 0;
    for (const r of recs) {
      if (r.date < p.start || r.date > until) continue;
      spentTotal += r.spent;
      earnedTotal += r.earned;
      const c = byCategory.get(r.category) ?? { amount: 0, count: 0 };
      c.amount += r.spent || r.earned;
      c.count += 1;
      byCategory.set(r.category, c);
    }
    return { byCategory, spent: spentTotal, earned: earnedTotal };
  };
  const cur = tally(period, cutoff);
  const before = tally(prev, prev.end);
  const categoriesOf = (kind: "spend" | "income", total: number): SpendingCategory[] =>
    [...cur.byCategory.entries()]
      .filter(([id]) => CATEGORIES[id].kind === kind)
      .map(([id, c]) => ({
        id,
        amount: c.amount / 100,
        count: c.count,
        share: total > 0 ? c.amount / total : 0,
        previous: (before.byCategory.get(id)?.amount ?? 0) / 100,
      }))
      .sort((a, b) => b.amount - a.amount);

  return {
    baseCurrency: base,
    today,
    range,
    period: { start: period.start, end: period.end, unit: period.unit, cutoff },
    previousPeriod: { start: prev.start, end: prev.end },
    isCurrent,
    canGoBack: firstDate !== null && firstDate < period.start,
    spent: run / 100,
    previousComparable: comparable / 100,
    previousTotal: previousTotal / 100,
    projected: projecting ? projectedTotal / 100 : null,
    upcomingSubscriptions: upcomingSubscriptions / 100,
    points,
    income: { total: cur.earned / 100, previous: before.earned / 100, categories: categoriesOf("income", cur.earned) },
    cashflow: (cur.earned - cur.spent) / 100,
    categories: categoriesOf("spend", cur.spent),
    otherCurrencies: [...other].sort(),
  };
}
