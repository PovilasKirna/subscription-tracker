import type { LucideIcon } from "lucide-react";

// Filter definitions shared by every data table. A definition describes one filter dimension
// (its menu entry, options and chip text). `accessor` is only needed for client-side tables.

export type FilterOption<V extends string = string> = { value: V; label: string; icon?: LucideIcon };

export type FilterDef<TRow = unknown, K extends string = string, V extends string = string> = {
  key: K;
  label: string;
  icon: LucideIcon;
  /** Plural used in chips when many values are picked: "3 types". */
  noun: string;
  options: FilterOption<V>[];
  /** Client mode: the row's value for this dimension. */
  accessor?: (row: TRow) => string;
};

export type FilterSelection = Record<string, readonly string[]>;
export type FilterFacets = Record<string, Record<string, number>>;

/** Chip text: "Money out (−)", "Card payment, Fee", or "3 types". */
export function summarizeFilter(def: FilterDef<never>, selected: readonly string[]): string {
  const labels = def.options.filter((o) => selected.includes(o.value)).map((o) => o.label);
  return labels.length <= 2 ? labels.join(", ") : `${labels.length} ${def.noun}`;
}

// ---------- client-side helpers ----------

const matches = <TRow>(row: TRow, defs: readonly FilterDef<TRow>[], selection: FilterSelection, except?: string) =>
  defs.every((d) => d.key === except || !selection[d.key]?.length || !d.accessor || selection[d.key].includes(d.accessor(row)));

/** Rows passing every active filter. */
export function applyFilters<TRow>(rows: readonly TRow[], defs: readonly FilterDef<TRow>[], selection: FilterSelection): TRow[] {
  return rows.filter((r) => matches(r, defs, selection));
}

/** Per-option counts, each ignoring its own dimension's selection (standard faceted search). */
export function countFacets<TRow>(rows: readonly TRow[], defs: readonly FilterDef<TRow>[], selection: FilterSelection): FilterFacets {
  const facets: FilterFacets = {};
  for (const d of defs) {
    const counts: Record<string, number> = {};
    if (d.accessor) {
      for (const r of rows) {
        if (!matches(r, defs, selection, d.key)) continue;
        const v = d.accessor(r);
        counts[v] = (counts[v] ?? 0) + 1;
      }
    }
    facets[d.key] = counts;
  }
  return facets;
}
