import type { CategoryId } from "../categories";
import { type TransactionFilters, TX_TYPES } from "../search-params";
import type { TransactionsPayload } from "../types";
import { type CategoryRules, categoryFields } from "./categorize";
import type { TxRow } from "./db";
import { merchantDomain } from "./merchant";

// Server-side filtering, sorting, faceting and pagination for the transactions data table.

type Facet = keyof TransactionsPayload["facets"];

const KNOWN_TYPES = new Set<string>(TX_TYPES);
const typeOf = (t: TxRow) => (t.type && KNOWN_TYPES.has(t.type) ? t.type : "UNKNOWN");
const flowOf = (t: TxRow) => (t.amount_minor >= 0 ? "in" : "out");
const NO_RULES: CategoryRules = { byTx: new Map(), byMerchant: new Map() };

export function queryTransactions(
  txs: TxRow[],
  txToSub: Map<string, string>,
  f: TransactionFilters,
  websiteOf: (merchantKey: string, subKey: string | null) => string | null = (m) => merchantDomain(m) ?? null,
  categories: { categoryOf: ReadonlyMap<string, CategoryId>; rules: CategoryRules } = { categoryOf: new Map(), rules: NO_RULES },
): TransactionsPayload {
  const subOf = (t: TxRow) => (txToSub.has(t.id) ? "subscription" : "other");
  const categoryOf = (t: TxRow) => categories.categoryOf.get(t.id) ?? "general";
  const value: Record<Facet, (t: TxRow) => string> = {
    flow: flowOf,
    type: typeOf,
    source: (t) => t.source,
    sub: subOf,
    category: categoryOf,
  };
  const selected: Record<Facet, readonly string[]> = { flow: f.flow, type: f.type, source: f.source, sub: f.sub, category: f.category };

  const needle = f.q.trim().toLowerCase();
  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const inMonth = txs.filter(
    (t) =>
      (!/^\d{4}-\d{2}$/.test(f.month) || t.date.startsWith(f.month)) &&
      (!isDate(f.from) || t.date >= f.from) &&
      (!isDate(f.to) || t.date <= f.to),
  );
  const searched = needle
    ? inMonth.filter((t) => t.description.toLowerCase().includes(needle) || t.merchant_key.includes(needle))
    : inMonth;
  const passes = (t: TxRow, except?: Facet) =>
    (Object.keys(selected) as Facet[]).every((k) => k === except || !selected[k].length || selected[k].includes(value[k](t)));

  // Each facet's counts ignore that facet's own selection (standard faceted search).
  const facets = { flow: {}, type: {}, source: {}, sub: {}, category: {} } as TransactionsPayload["facets"];
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
      website: websiteOf(t.merchant_key, txToSub.get(t.id) ?? null),
      amount: t.amount_minor / 100,
      currency: t.currency,
      type: typeOf(t),
      source: t.source,
      subscriptionKey: txToSub.get(t.id) ?? null,
      ...categoryFields(t, categories.categoryOf, categories.rules),
    })),
  };
}
