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

/**
 * The calendar day (YYYY-MM-DD) a timestamp falls on in `timeZone` (IANA; the runtime's own zone when
 * omitted). Date-only input is already a calendar day and is returned as is; unparseable input falls
 * back to its date part.
 */
export function localDate(at: string, timeZone?: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(at)) return at;
  const t = new Date(at);
  if (Number.isNaN(t.getTime())) return at.slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).formatToParts(t);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

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
