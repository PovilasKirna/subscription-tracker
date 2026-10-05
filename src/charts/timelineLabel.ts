// The accessible sentence for one SubscriptionTimeline row, kept apart from the component so it can be tested.
import type { TimelineRow } from "./types";

type Format = {
  money: (amount: number, currency: string) => string;
  date: (iso: string) => string;
};

/**
 * Everything a row's marks and tooltip show, as one sentence for screen readers. With `from` set it
 * describes only the charges and price changes inside the window (and names its start), so it agrees
 * with the visible chart; without it, the row's whole history.
 */
export function timelineRowLabel(row: TimelineRow, format: Format, from?: string): string {
  const charges = from ? row.charges.filter((c) => c.date >= from) : row.charges;
  const priceChanges = from ? row.priceChanges.filter((pc) => pc.date >= from) : row.priceChanges;
  const first = charges[0]?.date ?? row.firstCharge;
  const last = charges.at(-1)?.date ?? row.lastCharge;
  const latest = charges.at(-1);
  const changes = priceChanges.map(
    (pc) => `${format.money(pc.from, row.currency)} to ${format.money(pc.to, row.currency)} on ${format.date(pc.date)}`,
  );
  return [
    `${row.name}: ${charges.length} charges${from ? ` since ${format.date(from)}` : ""} from ${format.date(first)} to ${format.date(last)}`,
    latest && `latest ${format.money(latest.amount, row.currency)}`,
    changes.length && `price changes: ${changes.join("; ")}`,
  ]
    .filter(Boolean)
    .join(", ");
}
