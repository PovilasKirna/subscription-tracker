"use client";

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { DataTable, DataTablePagination, DataTableToolbar, useDataTable } from "@/components/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { localDate } from "@/lib/format";
import { transactionsQuery } from "@/lib/query/options";
import { PAGE_SIZES, TX_SORT_COLUMNS, transactionParams } from "@/lib/search-params";
import { transactionColumns } from "./columns";
import { TRANSACTION_FILTERS } from "./filters";
import { TransactionMobileRow } from "./TransactionMobileRow";
import { TransactionRowActions } from "./TransactionRowActions";

/**
 * Server-side data table: search, filters, sorting and pagination live in the URL (nuqs);
 * TanStack Query fetches the matching page from /api/transactions. URL updates run in a
 * transition so the current page stays visible (dimmed) while the next one loads.
 */
export function TransactionsTable() {
  const [isPending, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(transactionParams, { startTransition, history: "replace" });
  const { data } = useSuspenseQuery(transactionsQuery(params));

  // Warm the next page in the background so paging forward is instant.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (data.page < data.pageCount) void queryClient.prefetchQuery(transactionsQuery({ ...params, page: data.page + 1 }));
  }, [queryClient, params, data.page, data.pageCount]);

  const showMerchant = useCallback((merchantKey: string) => void setParams({ q: merchantKey, page: null }), [setParams]);
  const columns = useMemo(() => transactionColumns(showMerchant), [showMerchant]);
  // Only decides whether phone rows show the year; a mismatch at New Year would just re-render.
  const [today] = useState(() => localDate(new Date().toISOString()));

  const table = useDataTable({
    mode: "server",
    data: data.items,
    columns,
    getRowId: (row) => row.id,
    pageCount: data.pageCount,
    rowCount: data.total,
    initialColumnVisibility: { source: false },
    sorting: [{ id: params.sort, desc: params.dir === "desc" }],
    onSortingChange: ([next]) =>
      void setParams({
        sort: TX_SORT_COLUMNS.find((c) => c === next?.id) ?? "date",
        dir: next?.desc === false ? "asc" : "desc",
        page: null,
      }),
    pagination: { pageIndex: data.page - 1, pageSize: params.perPage },
    onPaginationChange: ({ pageIndex, pageSize }) => {
      const perPage = PAGE_SIZES.find((s) => s === pageSize) ?? 25;
      void setParams({ perPage, page: perPage !== params.perPage || pageIndex === 0 ? null : pageIndex + 1 });
    },
  });

  const selection = { flow: params.flow, sub: params.sub, type: params.type, source: params.source };
  return (
    <div className="flex flex-col gap-3">
      <DataTableToolbar
        table={table}
        search={{
          value: params.q,
          onChange: (q) => void setParams({ q: q || null, page: null }),
          placeholder: "Search description or merchant…",
        }}
        filters={{
          defs: TRANSACTION_FILTERS,
          selection,
          facets: data.facets,
          onChange: (key, values) =>
            void setParams({ [key]: values.length ? values : null, page: null } as Parameters<typeof setParams>[0]),
        }}
        onReset={() => void setParams({ q: null, flow: null, sub: null, type: null, source: null, page: null })}
      />
      <DataTable
        table={table}
        pending={isPending}
        renderMobileRow={(row) => <TransactionMobileRow tx={row} today={today} />}
        renderMobileActions={(row) => <TransactionRowActions tx={row} onShowMerchant={showMerchant} triggerClassName="size-11" />}
        empty="No transactions match these filters."
      />
      <DataTablePagination table={table} total={data.total} pageSizes={PAGE_SIZES} />
    </div>
  );
}

export function TransactionsTableSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-label="Loading transactions">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-full sm:w-72" />
        <Skeleton className="h-8 w-20" />
      </div>
      <Card className="py-0">
        <CardContent className="flex flex-col px-4">
          {Array.from({ length: 12 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
            <div key={i} className="flex items-center gap-3 border-b py-3 last:border-0 sm:gap-6">
              <Skeleton className="size-7 shrink-0 rounded-md sm:hidden" />
              <Skeleton className="hidden h-4 w-24 sm:block" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 w-24 sm:block" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Skeleton className="ml-auto h-7 w-80 max-w-full" />
    </div>
  );
}
