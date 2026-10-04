"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  type Table as TanstackTable,
  type Updater,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { type KeyboardEvent, type MouseEvent, type ReactNode, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    /** Name used in the column View menu. */
    label?: string;
    /** Classes for both header and cells (width, alignment). */
    className?: string;
  }
}

const resolve = <T,>(updater: Updater<T>, current: T): T => (typeof updater === "function" ? (updater as (old: T) => T)(current) : updater);

type BaseOptions<TData> = {
  data: TData[];
  // biome-ignore lint/suspicious/noExplicitAny: column value types differ per column
  columns: ColumnDef<TData, any>[];
  getRowId: (row: TData) => string;
  /** Controlled state, so callers can keep it in the URL (nuqs) or anywhere else. */
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  pagination: PaginationState;
  onPaginationChange: (pagination: PaginationState) => void;
  initialColumnVisibility?: VisibilityState;
};

export type UseDataTableOptions<TData> =
  /** The server sorts, filters and paginates; `data` is the current page. */
  | (BaseOptions<TData> & { mode: "server"; pageCount: number; rowCount: number })
  /** All rows are on the client; TanStack sorts and paginates them. Filter `data` before passing it. */
  | (BaseOptions<TData> & { mode: "client" });

/** TanStack Table configured for either server- or client-side data. */
export function useDataTable<TData>(options: UseDataTableOptions<TData>): TanstackTable<TData> {
  const { data, columns, getRowId, sorting, onSortingChange, pagination, onPaginationChange } = options;
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(options.initialColumnVisibility ?? {});
  return useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    ...(options.mode === "server"
      ? { manualPagination: true, manualSorting: true, manualFiltering: true, pageCount: options.pageCount, rowCount: options.rowCount }
      : { getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(), autoResetPageIndex: false }),
    enableSortingRemoval: false,
    state: { sorting, pagination, columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: (u) => onSortingChange(resolve(u, sorting)),
    onPaginationChange: (u) => onPaginationChange(resolve(u, pagination)),
  });
}

/** Clicks on interactive children (menus, buttons, links) don't count as row clicks. */
const fromInteractive = (e: MouseEvent | KeyboardEvent) =>
  Boolean((e.target as HTMLElement).closest("button, a, input, [role=menuitem], [role=menu], [data-no-row-click]"));

/** Renders any TanStack table in a card: header, rows, empty state, optional row click. */
export function DataTable<TData>({
  table,
  onRowClick,
  rowLabel,
  pending,
  empty = "No results.",
  className,
}: {
  table: TanstackTable<TData>;
  onRowClick?: (row: TData) => void;
  /** Accessible name for clickable rows, e.g. "Open Netflix". */
  rowLabel?: (row: TData) => string;
  /** Dims the table while a new page/filter loads (e.g. inside a transition). */
  pending?: boolean;
  empty?: ReactNode;
  className?: string;
}) {
  const rows = table.getRowModel().rows;
  return (
    <Card className={cn("py-0 transition-opacity", pending && "opacity-60", className)} aria-busy={pending}>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => (
                  <TableHead key={header.id} className={cn("first:pl-4 last:pr-3", header.column.columnDef.meta?.className)}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(onRowClick && "cursor-pointer")}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={onRowClick && rowLabel ? rowLabel(row.original) : undefined}
                  onClick={onRowClick ? (e) => !fromInteractive(e) && onRowClick(row.original) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if ((e.key === "Enter" || e.key === " ") && !fromInteractive(e)) {
                            e.preventDefault();
                            onRowClick(row.original);
                          }
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn("first:pl-4 last:pr-3", cell.column.columnDef.meta?.className)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-32 text-center text-muted-foreground">
                  {empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
