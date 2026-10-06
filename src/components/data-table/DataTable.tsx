"use client";

import {
  type ColumnDef,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type Row,
  type SortingState,
  type Table as TanstackTable,
  type Updater,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { type MouseEvent, type ReactNode, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { DataTableMobileSort } from "./DataTableMobileSort";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    /** Name used in the column View menu and the phone sort menu. */
    label?: string;
    /**
     * Classes for both header and cells (width, alignment, visibility). The card is a size container
     * named `data-table`, so hide columns with `hidden @2xl/data-table:table-cell`: a column then
     * appears only when the card itself has room, whatever the viewport.
     */
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
  /** Rows nested under a row (e.g. a group's members), shown when it's expanded. */
  getSubRows?: (row: TData) => TData[] | undefined;
};

export type UseDataTableOptions<TData> =
  /** The server sorts, filters and paginates; `data` is the current page. */
  | (BaseOptions<TData> & { mode: "server"; pageCount: number; rowCount: number })
  /** All rows are on the client; TanStack sorts and paginates them. Filter `data` before passing it. */
  | (BaseOptions<TData> & { mode: "client" });

/** TanStack Table configured for either server- or client-side data. */
export function useDataTable<TData>(options: UseDataTableOptions<TData>): TanstackTable<TData> {
  const { data, columns, getRowId, sorting, onSortingChange, pagination, onPaginationChange, getSubRows } = options;
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(options.initialColumnVisibility ?? {});
  const [expanded, setExpanded] = useState<ExpandedState>({});
  return useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    ...(getSubRows ? { getSubRows, getExpandedRowModel: getExpandedRowModel(), autoResetExpanded: false } : {}),
    ...(options.mode === "server"
      ? { manualPagination: true, manualSorting: true, manualFiltering: true, pageCount: options.pageCount, rowCount: options.rowCount }
      : { getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(), autoResetPageIndex: false }),
    enableSortingRemoval: false,
    state: { sorting, pagination, columnVisibility, expanded },
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: setExpanded,
    onSortingChange: (u) => onSortingChange(resolve(u, sorting)),
    onPaginationChange: (u) => onPaginationChange(resolve(u, pagination)),
  });
}

/** Clicks on interactive children (menus, buttons, links) don't count as row clicks. */
const fromInteractive = (e: MouseEvent) =>
  Boolean((e.target as HTMLElement).closest("button, a, input, [role=menuitem], [role=menu], [data-no-row-click]"));

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

/**
 * Renders any TanStack table in a card: header, rows, empty state, optional row click.
 *
 * With `renderMobileRow`, a card narrower than 36rem (phones, and tablets beside the nav rail) shows
 * a list of two-line rows instead of the table, plus a sort menu standing in for the column headers.
 * The card is a size container, so the switch follows the space the table actually has, not the
 * viewport.
 *
 * Keyboard and screen-reader users open a row through a real control: on phones each list row is a
 * button; in the table, the column that names the row renders its own button (see the columns).
 * The whole-row click is only a mouse convenience.
 */
export function DataTable<TData>({
  table,
  onRowClick,
  renderMobileRow,
  renderMobileActions,
  pending,
  empty = "No results.",
  className,
}: {
  table: TanstackTable<TData>;
  onRowClick?: (row: TData) => void;
  /** Two-line list row for narrow cards. Rendered inside a button when `onRowClick` is set. */
  renderMobileRow?: (row: TData, tableRow: Row<TData>) => ReactNode;
  /** Row menu beside each list row; kept outside the row button so both stay operable. */
  renderMobileActions?: (row: TData) => ReactNode;
  /** Dims the table while a new page/filter loads (e.g. inside a transition). */
  pending?: boolean;
  empty?: ReactNode;
  className?: string;
}) {
  const rows = table.getRowModel().rows;
  const mobile = Boolean(renderMobileRow);
  return (
    <Card className={cn("@container/data-table py-0 transition-opacity", pending && "opacity-60", className)} aria-busy={pending}>
      <CardContent className="px-0">
        {renderMobileRow && (
          <div className="@xl/data-table:hidden">
            <DataTableMobileSort table={table} />
            {rows.length ? (
              <ul className="divide-y">
                {rows.map((row) => (
                  <li key={row.id} className={cn("flex items-center gap-1 pr-1.5", row.depth > 0 && "bg-muted/30")}>
                    {onRowClick ? (
                      <button
                        type="button"
                        aria-expanded={row.getCanExpand() ? row.getIsExpanded() : undefined}
                        onClick={() => onRowClick(row.original)}
                        className="min-w-0 flex-1 self-stretch py-2.5 pl-4 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring active:bg-muted/50"
                      >
                        {renderMobileRow(row.original, row)}
                      </button>
                    ) : (
                      <div className="min-w-0 flex-1 py-2.5 pl-4">{renderMobileRow(row.original, row)}</div>
                    )}
                    {renderMobileActions && <div className="shrink-0">{renderMobileActions(row.original)}</div>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">{empty}</p>
            )}
          </div>
        )}
        <div className={cn(mobile && "hidden @xl/data-table:block")}>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id} className="hover:bg-transparent">
                  {group.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        aria-sort={header.column.getCanSort() ? (sorted ? ARIA_SORT[sorted] : "none") : undefined}
                        className={cn("first:pl-4 last:pr-3", header.column.columnDef.meta?.className)}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(onRowClick && "cursor-pointer", row.depth > 0 && "bg-muted/30")}
                    onClick={onRowClick ? (e) => !fromInteractive(e) && onRowClick(row.original) : undefined}
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
        </div>
      </CardContent>
    </Card>
  );
}
