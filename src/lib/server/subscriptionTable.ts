import { isLive } from "../insights";
import { SUB_STATUSES, type SubscriptionFilters } from "../search-params";
import type { Charge, SubscriptionRow, SubscriptionsPayload, SubscriptionsTablePayload } from "../types";

// Server-side filtering, sorting, faceting and pagination for the subscriptions data table.

type Facet = keyof SubscriptionsTablePayload["facets"];

/** Charges each row keeps: the table's sparkline draws the last 12. */
const SPARKLINE_CHARGES = 12;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The summary row for a group: its name, the members' combined cost (live members only, unless
 * none are live), the soonest next charge and the most current status. Shared fields (category,
 * cadence, logo) carry over when every member agrees.
 */
function groupRow(name: string, members: SubscriptionRow[]): SubscriptionRow {
  const [first] = members;
  const live = members.filter((m) => m.rowStatus !== "ignored" && isLive(m));
  const counted = live.length ? live : members;
  const sum = (f: (m: SubscriptionRow) => number) => round2(counted.reduce((s, m) => s + f(m), 0));
  const shared = <T>(f: (m: SubscriptionRow) => T): T | undefined => (members.every((m) => f(m) === f(first)) ? f(first) : undefined);
  const best = members.reduce((a, b) => (SUB_STATUSES.indexOf(b.rowStatus) < SUB_STATUSES.indexOf(a.rowStatus) ? b : a));
  const byDate = new Map<string, number>();
  for (const m of members) for (const c of m.charges) byDate.set(c.date, (byDate.get(c.date) ?? 0) + c.amount);
  const charges: Charge[] = [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount: round2(amount) }));
  const dates = (f: (m: SubscriptionRow) => string | null) => members.flatMap((m) => f(m) ?? []).sort();
  return {
    key: `group:${name}|${first.currency}`,
    merchantKey: "",
    name,
    category: shared((m) => m.category) ?? "Mixed",
    currency: first.currency,
    cadence: shared((m) => m.cadence) ?? "monthly",
    cadenceChosen: false,
    periodDays: shared((m) => m.periodDays) ?? 30.44,
    amount: sum((m) => m.amount),
    monthlyCost: sum((m) => m.monthlyCost),
    yearlyCost: sum((m) => m.yearlyCost),
    netMonthlyCost: sum((m) => m.netMonthlyCost),
    firstCharge: dates((m) => m.firstCharge)[0],
    lastCharge: dates((m) => m.lastCharge).at(-1) ?? first.lastCharge,
    nextCharge: dates((m) => m.nextCharge)[0] ?? null,
    chargeCount: members.reduce((s, m) => s + m.chargeCount, 0),
    totalSpent: round2(members.reduce((s, m) => s + m.totalSpent, 0)),
    totalReimbursed: round2(members.reduce((s, m) => s + m.totalReimbursed, 0)),
    pendingReimbursements: members.reduce((s, m) => s + m.pendingReimbursements, 0),
    reimbursement: null,
    reimbursementPeriods: [],
    status: best.status,
    rowStatus: best.rowStatus,
    confidence: Math.min(...members.map((m) => m.confidence)),
    confirmed: false,
    pinned: false,
    known: false,
    color: null,
    colorChosen: false,
    website: shared((m) => m.website) ?? null,
    websiteChosen: false,
    group: name,
    priceChanges: [],
    charges,
    members,
  };
}

/** Only the charges the sparkline draws, for a row and its members. */
const trim = (r: SubscriptionRow): SubscriptionRow => ({
  ...r,
  charges: r.charges.slice(-SPARKLINE_CHARGES),
  ...(r.members ? { members: r.members.map(trim) } : {}),
});

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
        (r) =>
          r.name.toLowerCase().includes(needle) ||
          r.merchantKey.includes(needle) ||
          r.category.toLowerCase().includes(needle) ||
          Boolean(r.group?.toLowerCase().includes(needle)),
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

  // Facets count subscriptions; the table lists each group as one row, where its first member was.
  const grouped = new Map<string, SubscriptionRow[]>();
  const slots: (SubscriptionRow | string)[] = [];
  for (const r of searched.filter((r) => passes(r))) {
    if (!r.group) {
      slots.push(r);
      continue;
    }
    const id = `${r.group}|${r.currency}`;
    const members = grouped.get(id);
    if (members) members.push(r);
    else {
      grouped.set(id, [r]);
      slots.push(id);
    }
  }
  const filtered = slots.map((s) => {
    if (typeof s !== "string") return s;
    const members = grouped.get(s) as SubscriptionRow[];
    return groupRow(members[0].group as string, members);
  });
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
  const order = (a: SubscriptionRow, b: SubscriptionRow) => missingLast(a, b) || sign * compare[f.sort](a, b);
  filtered.sort(order);
  for (const r of filtered) r.members?.sort(order);

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
    items: filtered.slice((page - 1) * pageSize, page * pageSize).map(trim),
  };
}
