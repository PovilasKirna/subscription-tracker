"use client";

import type { Table } from "@tanstack/react-table";
import { SearchIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTableFilterChips, DataTableFilterMenu, type DataTableFilterProps } from "./DataTableFilters";
import { DataTableViewOptions } from "./DataTableViewOptions";

type SearchProps = { value: string; onChange: (value: string) => void; placeholder?: string; debounceMs?: number };

/** Search box that keeps typing local and only commits after a pause. */
export function DataTableSearch({ value, onChange, placeholder = "Search…", debounceMs = 300 }: SearchProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => onChange(draft), debounceMs);
    return () => clearTimeout(t);
  }, [draft, value, onChange, debounceMs]);
  return (
    <div className="relative w-full sm:w-72">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        className="h-8 pl-8"
        aria-label={placeholder}
      />
    </div>
  );
}

/**
 * Composable toolbar: every part is optional. Pass `search` for a debounced search box,
 * `filters` for the Filter menu + chips, `table` for the column View menu, and children
 * for extra controls (rendered before the View menu).
 */
export function DataTableToolbar<TData>({
  table,
  search,
  filters,
  onReset,
  children,
}: {
  table?: Table<TData>;
  search?: SearchProps;
  filters?: DataTableFilterProps;
  /** Shown as "Clear filters" whenever search or filters are active. */
  onReset?: () => void;
  children?: ReactNode;
}) {
  const active = Boolean(search?.value) || Boolean(filters && Object.values(filters.selection).some((v) => v?.length));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {search && <DataTableSearch {...search} />}
      {filters && (
        <>
          <DataTableFilterMenu {...filters} />
          <DataTableFilterChips {...filters} />
        </>
      )}
      {active && onReset && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          Clear filters <XIcon />
        </Button>
      )}
      <div className="ml-auto flex items-center gap-2">
        {children}
        {table && <DataTableViewOptions table={table} />}
      </div>
    </div>
  );
}
