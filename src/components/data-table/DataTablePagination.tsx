"use client";

import type { Table } from "@tanstack/react-table";
import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Server-paginated footer: rows per page, "page x of y", first/prev/next/last. */
export function DataTablePagination<TData>({
  table,
  total,
  pageSizes,
}: {
  table: Table<TData>;
  total: number;
  pageSizes: readonly number[];
}) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = Math.max(1, table.getPageCount());
  const from = total ? pageIndex * pageSize + 1 : 0;
  const to = Math.min(total, (pageIndex + 1) * pageSize);
  const sizes = Object.fromEntries(pageSizes.map((s) => [String(s), String(s)]));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-muted-foreground">
      <div className="tabular">
        {from.toLocaleString("en-GB")}–{to.toLocaleString("en-GB")} of {total.toLocaleString("en-GB")}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">Rows per page</span>
          <Select items={sizes} value={String(pageSize)} onValueChange={(v) => v && table.setPageSize(Number(v))}>
            <SelectTrigger size="sm" className="w-18" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizes.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="tabular">
          Page {pageIndex + 1} of {pageCount}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            className="hidden sm:inline-flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label="First page"
          >
            <ChevronsLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRightIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="hidden sm:inline-flex"
            onClick={() => table.setPageIndex(pageCount - 1)}
            disabled={!table.getCanNextPage()}
            aria-label="Last page"
          >
            <ChevronsRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}
