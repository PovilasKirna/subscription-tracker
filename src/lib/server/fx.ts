import type { InStatement } from "@libsql/client";
import { all, type Db } from "./db";
import { getState, setState } from "./settings";

// Currency conversion for net worth: ECB reference rates from frankfurter.dev (free, no key).
// Fetched at most once a day, and only when some holding isn't in the base currency. Each day of
// history converts at the rate of that day (or the nearest one the table has).

const API = "https://api.frankfurter.dev/v1/latest?base=EUR";

/** Currency → rates (units per 1 EUR), oldest first. EUR itself is implicit (always 1). */
export type RateTable = Map<string, { date: string; perEur: number }[]>;

export async function loadRates(db: Db): Promise<RateTable> {
  const rows = await all<{ date: string; currency: string; per_eur: number }>(
    db,
    "SELECT date, currency, per_eur FROM fx_rates ORDER BY date",
  );
  const table: RateTable = new Map();
  for (const r of rows) {
    const list = table.get(r.currency) ?? [];
    list.push({ date: r.date, perEur: Number(r.per_eur) });
    table.set(r.currency, list);
  }
  return table;
}

/** Units of `currency` per EUR on `date`: that day's rate or the last before it, else the earliest known. Pure. */
export function rateOn(table: RateTable, currency: string, date: string): number | null {
  if (currency === "EUR") return 1;
  const list = table.get(currency);
  if (!list?.length) return null;
  let found = list[0];
  for (const r of list) {
    if (r.date > date) break;
    found = r;
  }
  return found.perEur;
}

/** `amount` in `from` expressed in `to` on `date`, or null when a rate is missing. Pure. */
export function convert(table: RateTable, amount: number, from: string, to: string, date: string): number | null {
  if (from === to) return amount;
  const a = rateOn(table, from, date);
  const b = rateOn(table, to, date);
  return a && b ? (amount / a) * b : null;
}

/**
 * Makes sure today's rates are stored when any of `currencies` needs converting to `base`.
 * Best-effort: without network the last stored rates keep working.
 */
export async function refreshRates(db: Db, currencies: Iterable<string>, base: string, today: string): Promise<void> {
  const needed = new Set([...currencies].filter((c) => c !== base));
  if (!needed.size) return;
  if ((await getState<string>(db, "state.fxFetchedOn")) === today) return;
  try {
    const res = await fetch(API, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`frankfurter ${res.status}`);
    const body = (await res.json()) as { date: string; rates: Record<string, number> };
    const writes: InStatement[] = Object.entries(body.rates).map(([currency, perEur]) => ({
      sql: "INSERT INTO fx_rates (date, currency, per_eur) VALUES (?, ?, ?) ON CONFLICT(date, currency) DO UPDATE SET per_eur = excluded.per_eur",
      args: [body.date, currency, perEur],
    }));
    if (writes.length) await db.batch(writes, "write");
    await setState(db, "state.fxFetchedOn", today);
  } catch (e) {
    console.warn("[fx] could not refresh exchange rates:", (e as Error).message);
  }
}
