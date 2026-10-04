"use client";

import type { Column } from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Sortable header (shadcn data-table pattern): asc / desc / hide. */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
}) {
  if (!column.getCanSort()) return <div className={className}>{title}</div>;
  const sorted = column.getIsSorted();
  const Icon = sorted === "desc" ? ArrowDownIcon : sorted === "asc" ? ArrowUpIcon : ChevronsUpDownIcon;
  return (
    <div className={cn("flex items-center", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm" className="-ml-2.5 h-7 gap-1 px-2 data-popup-open:bg-muted" aria-label={`Sort by ${title}`} />
          }
        >
          {title}
          <Icon className={cn("size-3.5", !sorted && "text-muted-foreground")} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <ArrowUpIcon /> Ascending
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <ArrowDownIcon /> Descending
          </DropdownMenuItem>
          {column.getCanHide() && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                <EyeOffIcon /> Hide column
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
