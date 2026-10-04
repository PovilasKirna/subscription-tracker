"use client";

import type { Table } from "@tanstack/react-table";
import { Settings2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Column visibility toggle. Uses each column's `meta.label` for its name. */
export function DataTableViewOptions<TData>({ table }: { table: Table<TData> }) {
  const columns = table.getAllColumns().filter((c) => c.getCanHide());
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="ml-auto hidden lg:inline-flex" />}>
        <Settings2Icon /> View
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {columns.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={(v) => column.toggleVisibility(Boolean(v))}
            >
              {(column.columnDef.meta as { label?: string } | undefined)?.label ?? column.id}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
