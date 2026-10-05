"use client";

import type { Table } from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Stands in for the sortable column headers when the table shows as a list (phones): pick the
 * column and the order. Writes through `table.setSorting`, so the URL-backed state stays the source.
 */
export function DataTableMobileSort<TData>({ table }: { table: Table<TData> }) {
  const columns = table.getAllLeafColumns().filter((c) => c.getCanSort());
  if (!columns.length) return null;
  const [current] = table.getState().sorting;
  const active = columns.find((c) => c.id === current?.id);
  const desc = current?.desc ?? false;
  const label = (id: string) => columns.find((c) => c.id === id)?.columnDef.meta?.label ?? id;
  const Icon = desc ? ArrowDownIcon : ArrowUpIcon;

  return (
    <div className="flex items-center justify-end border-b px-2 py-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground pointer-coarse:h-9 data-popup-open:bg-muted" />
          }
        >
          <span>
            Sort: <span className="text-foreground">{active ? label(active.id) : "Default"}</span>
          </span>
          {active && <Icon aria-hidden />}
          {active && <span className="sr-only">, {desc ? "descending" : "ascending"}</span>}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={active?.id ?? ""} onValueChange={(id) => table.setSorting([{ id: String(id), desc }])}>
              {columns.map((c) => (
                <DropdownMenuRadioItem key={c.id} value={c.id}>
                  {label(c.id)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Order</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={desc ? "desc" : "asc"}
              onValueChange={(v) => active && table.setSorting([{ id: active.id, desc: v === "desc" }])}
            >
              <DropdownMenuRadioItem value="asc">
                <ArrowUpIcon /> Ascending
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc">
                <ArrowDownIcon /> Descending
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
