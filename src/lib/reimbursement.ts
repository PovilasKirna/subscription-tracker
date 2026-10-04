import { fullDate, monthYearLabel, shortDate } from "./format";
import type { ReimbursementMode } from "./types";

// Client-safe helpers for the reimbursement UI.

export const MODE_LABEL: Record<ReimbursementMode, string> = { request: "You request it", automatic: "Paid automatically" };

/** 1 → "1st", 22 → "22nd". */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

export type StartOption = { value: string; label: string; hint: string };

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const nextMonthStart = (d: string) => {
  const [y, m] = d.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** How a period's start reads: its month when it starts on the 1st, otherwise the exact day. */
export const periodStartLabel = (startsOn: string) =>
  startsOn.endsWith("-01") ? monthYearLabel(startsOn.slice(0, 7)) : fullDate(startsOn);

/**
 * Where a reimbursement period can start. First "next charge onwards", which affects only charges
 * not made yet: this month when it has no charge yet, otherwise the day after the latest charge
 * when the next one is due this month too (weekly plans), else next month. Then every month that
 * has a charge, newest first (starting there includes that month's charges).
 */
export function startOptions(chargeDates: readonly string[], today: string, nextCharge?: string | null): StartOption[] {
  const sorted = [...chargeDates].sort();
  const firstInMonth = new Map<string, string>();
  for (const d of sorted) if (!firstInMonth.has(monthStart(d))) firstInMonth.set(monthStart(d), d);
  const thisMonth = monthStart(today);
  const lastCharge = sorted.filter((d) => d <= today).at(-1);
  let upcoming = thisMonth;
  if (firstInMonth.has(thisMonth)) {
    const dueThisMonth = lastCharge && nextCharge && nextCharge < nextMonthStart(today);
    upcoming = dueThisMonth ? nextDay(lastCharge) : nextMonthStart(today);
  }
  const options: StartOption[] = [{ value: upcoming, label: periodStartLabel(upcoming), hint: "next charge onwards" }];
  for (const month of [...firstInMonth.keys()].sort().reverse()) {
    if (month === upcoming) continue;
    options.push({
      value: month,
      label: monthYearLabel(month.slice(0, 7)),
      hint: `from the ${shortDate(firstInMonth.get(month) as string)} charge`,
    });
  }
  return options;
}

/** Parses "12,50" or "12.5" → 12.5; null when it isn't a number. */
export function parseAmount(v: string): number | null {
  const n = Number(v.replace(",", ".").trim());
  return v.trim() && Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
