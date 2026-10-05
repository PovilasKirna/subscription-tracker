import { fullDate, shortDate } from "@/lib/format";

/** "4 Oct" within `today`'s year, "4 Oct 2025" otherwise. Dense rows only; tables keep `fullDate`. */
export function compactDate(date: string, today: string): string {
  return date.slice(0, 4) === today.slice(0, 4) ? shortDate(date) : fullDate(date);
}
