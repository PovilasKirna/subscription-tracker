import { type TransactionFilters, TX_TYPES } from "../search-params";
import type { TransactionsPayload } from "../types";
import type { TxRow } from "./db";

// Server-side filtering, sorting, faceting and pagination for the transactions data table.

type Facet = keyof TransactionsPayload["facets"];

const KNOWN_TYPES = new Set<string>(TX_TYPES);
const typeOf = (t: TxRow) => (t.type && KNOWN_TYPES.has(t.type) ? t.type : "UNKNOWN");
const flowOf = (t: TxRow) => (t.amount_minor >= 0 ? "in" : "out");

export function queryTransactions(txs: TxRow[], txToSub: Map<string, string>, f: TransactionFilters): TransactionsPayload {
  const subOf = (t: TxRow) => (txToSub.has(t.id) ? "subscription" : "other");
  const value: Record<Facet, (t: TxRow) => string> = { flow: flowOf, type: typeOf, source: (t) => t.source, sub: subOf };
  const selected: Record<Facet, readonly string[]> = { flow: f.flow, type: f.type, source: f.source, sub: f.sub };

  const needle = f.q.trim().toLowerCase();
  const searched = needle ? txs.filter((t) => t.description.toLowerCase().includes(needle) || t.merchant_key.includes(needle)) : txs;
  const passes = (t: TxRow, except?: Facet) =>
    (Object.keys(selected) as Facet[]).every((k) => k === except || !selected[k].length || selected[k].includes(value[k](t)));

  // Each facet's counts ignore that facet's own selection (standard faceted search).
  const facets = { flow: {}, type: {}, source: {}, sub: {} } as TransactionsPayload["facets"];
  for (const k of Object.keys(facets) as Facet[]) {
    for (const t of searched) {
      if (!passes(t, k)) continue;
      const v = value[k](t);
      facets[k][v] = (facets[k][v] ?? 0) + 1;
    }
  }

  const filtered = searched.filter((t) => passes(t));
  const sign = f.dir === "asc" ? 1 : -1;
  const compare: Record<TransactionFilters["sort"], (a: TxRow, b: TxRow) => number> = {
    date: (a, b) => a.date.localeCompare(b.date),
    amount: (a, b) => a.amount_minor - b.amount_minor,
    description: (a, b) => a.description.localeCompare(b.description, "en", { sensitivity: "base" }),
  };
  // Stable tie-break on date then id keeps paging deterministic.
  filtered.sort((a, b) => sign * compare[f.sort](a, b) || b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

  const pageSize = f.perPage;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, f.page), pageCount);
  return {
    total: filtered.length,
    page,
    pageSize,
    pageCount,
    facets,
    items: filtered.slice((page - 1) * pageSize, page * pageSize).map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      merchantKey: t.merchant_key,
      amount: t.amount_minor / 100,
      currency: t.currency,
      type: typeOf(t),
      source: t.source,
      subscriptionKey: txToSub.get(t.id) ?? null,
    })),
  };
}
