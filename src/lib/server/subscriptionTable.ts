import { SUB_STATUSES, type SubscriptionFilters } from "../search-params";
import type { SubscriptionRow, SubscriptionsPayload, SubscriptionsTablePayload } from "../types";

// Server-side filtering, sorting, faceting and pagination for the subscriptions data table.

type Facet = keyof SubscriptionsTablePayload["facets"];

/** Charges each row keeps: the table's sparkline draws the last 12. */
const SPARKLINE_CHARGES = 12;

export function querySubscriptions(
  det: Pick<SubscriptionsPayload, "today" | "subscriptions" | "ignored">,
  f: SubscriptionFilters,
): SubscriptionsTablePayload {
  const rows: SubscriptionRow[] = [
    ...det.subscriptions.map((s) => ({ ...s, rowStatus: s.status })),
    ...det.ignored.map((s) => ({ ...s, rowStatus: "ignored" as const })),
  ];
  const value: Record<Facet, (r: SubscriptionRow) => string> = {
    status: (r) => r.rowStatus,
    cadence: (r) => r.cadence,
    category: (r) => r.category,
  };
  const selected: Record<Facet, readonly string[]> = { status: f.status, cadence: f.cadence, category: f.category };
  // Ignored rows only appear when the status filter asks for them.
  const passesFacet = (r: SubscriptionRow, k: Facet) =>
    selected[k].length ? selected[k].includes(value[k](r)) : k !== "status" || r.rowStatus !== "ignored";
  const passes = (r: SubscriptionRow, except?: Facet) => (Object.keys(selected) as Facet[]).every((k) => k === except || passesFacet(r, k));

  const needle = f.q.trim().toLowerCase();
  const searched = needle
    ? rows.filter(
        (r) => r.name.toLowerCase().includes(needle) || r.merchantKey.includes(needle) || r.category.toLowerCase().includes(needle),
      )
    : rows;

  // Each facet's counts ignore that facet's own selection (standard faceted search), so the
  // status menu still counts ignored rows while they're hidden.
  const facets = { status: {}, cadence: {}, category: {} } as SubscriptionsTablePayload["facets"];
  for (const k of Object.keys(facets) as Facet[]) {
    for (const r of searched) {
      if (!passes(r, k)) continue;
      const v = value[k](r);
      facets[k][v] = (facets[k][v] ?? 0) + 1;
    }
  }

  const filtered = searched.filter((r) => passes(r));
  const sign = f.dir === "asc" ? 1 : -1;
  const compare: Record<SubscriptionFilters["sort"], (a: SubscriptionRow, b: SubscriptionRow) => number> = {
    name: (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
    amount: (a, b) => a.amount - b.amount,
    monthlyCost: (a, b) => a.netMonthlyCost - b.netMonthlyCost, // what the column shows
    nextCharge: (a, b) => (a.nextCharge ?? "").localeCompare(b.nextCharge ?? ""),
    status: (a, b) => SUB_STATUSES.indexOf(a.rowStatus) - SUB_STATUSES.indexOf(b.rowStatus),
  };
  // Rows without a next charge go last in either direction; Array#sort is stable, so ties keep
  // detection order (paging stays deterministic).
  const missingLast = (a: SubscriptionRow, b: SubscriptionRow) =>
    f.sort === "nextCharge" ? Number(!a.nextCharge) - Number(!b.nextCharge) : 0;
  filtered.sort((a, b) => missingLast(a, b) || sign * compare[f.sort](a, b));

  const pageSize = f.perPage;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, f.page), pageCount);
  return {
    today: det.today,
    total: filtered.length,
    page,
    pageSize,
    pageCount,
    detected: det.subscriptions.length,
    categories: [...new Set(rows.map((r) => r.category))].sort((a, b) => a.localeCompare(b)),
    facets,
    items: filtered.slice((page - 1) * pageSize, page * pageSize).map((r) => ({ ...r, charges: r.charges.slice(-SPARKLINE_CHARGES) })),
  };
}
