// Reusable data-table kit (shadcn data-table pattern on TanStack Table v8).
//
//   const table = useDataTable({ mode: "server" | "client", data, columns, sorting, pagination, … });
//   <DataTableToolbar table={table} search={…} filters={…} onReset={…}>{extra buttons}</DataTableToolbar>
//   <DataTable table={table} onRowClick={…} renderMobileRow={…} renderMobileActions={…} pending={…} empty={…} />
//   <DataTablePagination table={table} total={…} pageSizes={[10, 25, 50]} />
//
// Columns use <DataTableColumnHeader> for sortable headers and `meta: { label, className }`. The table
// card is a size container named `data-table`: hide optional columns with `hidden @xl/data-table:table-cell`.
// With `renderMobileRow`, a narrow card shows two-line list rows instead of the table.
export { compactDate } from "./compactDate";
export { DataTable, type UseDataTableOptions, useDataTable } from "./DataTable";
export { DataTableColumnHeader } from "./DataTableColumnHeader";
export { DataTableFilterChips, DataTableFilterMenu, type DataTableFilterProps } from "./DataTableFilters";
export { DataTablePagination } from "./DataTablePagination";
export { DataTableSearch, DataTableToolbar } from "./DataTableToolbar";
export { DataTableViewOptions } from "./DataTableViewOptions";
export * from "./filters";
export { usePageSize } from "./usePageSize";
