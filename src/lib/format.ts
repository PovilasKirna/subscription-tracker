// Fixed locale so server-rendered HTML and client hydration produce identical strings.
const LOCALE = "en-GB";

const moneyCache = new Map<string, Intl.NumberFormat>();
export function money(amount: number, currency: string, opts: { compact?: boolean; cents?: boolean } = {}): string {
  const k = `${currency}|${opts.compact}|${opts.cents}`;
  let f = moneyCache.get(k);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      notation: opts.compact ? "compact" : "standard",
      minimumFractionDigits: opts.cents === false ? 0 : 2,
      maximumFractionDigits: opts.cents === false ? 0 : 2,
    });
    moneyCache.set(k, f);
  }
  return f.format(amount);
}

const dayFmt = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" });
const fullFmt = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat(LOCALE, { month: "short", timeZone: "UTC" });
const monthYearFmt = new Intl.DateTimeFormat(LOCALE, { month: "short", year: "numeric", timeZone: "UTC" });

const parse = (d: string) => new Date(`${d.length === 7 ? `${d}-01` : d.slice(0, 10)}T00:00:00Z`);
export const shortDate = (d: string) => dayFmt.format(parse(d));
export const fullDate = (d: string) => fullFmt.format(parse(d));
export const monthLabel = (ym: string) => monthFmt.format(parse(ym));
export const monthYearLabel = (ym: string) => monthYearFmt.format(parse(ym));

export function daysUntil(date: string, today: string): number {
  return Math.round((parse(date).getTime() - parse(today).getTime()) / 86_400_000);
}

export function relativeDays(date: string, today: string): string {
  const n = daysUntil(date, today);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export const CADENCE_LABEL = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Every 6 months",
  yearly: "Yearly",
} as const;
