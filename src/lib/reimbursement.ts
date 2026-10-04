import { monthYearLabel, shortDate } from "./format";
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

/**
 * Where a reimbursement period can start: month starts only, so a period covers whole billing
 * months. First the month from which only future charges are affected, then every month that has
 * a charge, newest first (starting there includes that month's charges).
 */
export function startOptions(chargeDates: readonly string[], today: string): StartOption[] {
  const firstInMonth = new Map<string, string>();
  for (const d of [...chargeDates].sort()) if (!firstInMonth.has(monthStart(d))) firstInMonth.set(monthStart(d), d);
  const thisMonth = monthStart(today);
  const upcoming = firstInMonth.has(thisMonth) ? nextMonthStart(today) : thisMonth;
  const options: StartOption[] = [{ value: upcoming, label: monthYearLabel(upcoming.slice(0, 7)), hint: "next charge onwards" }];
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
