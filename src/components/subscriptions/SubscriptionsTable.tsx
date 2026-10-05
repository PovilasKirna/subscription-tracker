"use client";

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useQueryState, useQueryStates } from "nuqs";
import { useCallback, useEffect, useMemo, useTransition } from "react";
import { DataTable, DataTablePagination, DataTableToolbar, useDataTable } from "@/components/data-table";
import { subscriptionsTableQuery } from "@/lib/query/options";
import { PAGE_SIZES, SUB_SORT_COLUMNS, subscriptionDrawerParams, subscriptionParams } from "@/lib/search-params";
import { subscriptionColumns } from "./columns";
import { SubscriptionActions } from "./SubscriptionActions";
import { SubscriptionMobileRow } from "./SubscriptionMobileRow";
import { subscriptionFilters } from "./shared";

/**
 * Server-side data table: search, filters, sorting and pagination live in the URL (nuqs);
 * TanStack Query fetches the matching page from /api/subscriptions/table. URL updates run in a
 * transition so the current page stays visible (dimmed) while the next one loads. Opening a row
 * (its name button, a click anywhere on it, or the whole row on phones) opens the detail drawer
 * (?sub=, independent of the table params).
 */
export function SubscriptionsTable() {
  const [isPending, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(subscriptionParams, { startTransition, history: "replace" });
  const { data } = useSuspenseQuery(subscriptionsTableQuery(params));

  // Warm the next page in the background so paging forward is instant.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (data.page < data.pageCount) void queryClient.prefetchQuery(subscriptionsTableQuery({ ...params, page: data.page + 1 }));
  }, [queryClient, params, data.page, data.pageCount]);
  const [, setOpen] = useQueryState("sub", subscriptionDrawerParams.sub);
  const open = useCallback((key: string) => void setOpen(key), [setOpen]);

  const defs = useMemo(() => subscriptionFilters(data.categories), [data.categories]);
  const columns = useMemo(() => subscriptionColumns(data.today, open), [data.today, open]);
  const table = useDataTable({
    mode: "server",
    data: data.items,
    columns,
    getRowId: (row) => row.key,
    pageCount: data.pageCount,
    rowCount: data.total,
    sorting: [{ id: params.sort, desc: params.dir === "desc" }],
    onSortingChange: ([next]) =>
      void setParams({ sort: SUB_SORT_COLUMNS.find((c) => c === next?.id) ?? "status", dir: next?.desc ? "desc" : "asc", page: null }),
    pagination: { pageIndex: data.page - 1, pageSize: params.perPage },
    onPaginationChange: ({ pageIndex, pageSize }) => {
      const perPage = PAGE_SIZES.find((s) => s === pageSize) ?? 25;
      void setParams({ perPage, page: perPage !== params.perPage || pageIndex === 0 ? null : pageIndex + 1 });
    },
  });

  const selection = { status: params.status, cadence: params.cadence, category: params.category };
  return (
    <div className="flex flex-col gap-3">
      <DataTableToolbar
        table={table}
        search={{ value: params.q, onChange: (q) => void setParams({ q: q || null, page: null }), placeholder: "Search subscriptions…" }}
        filters={{
          defs,
          selection,
          facets: data.facets,
          onChange: (key, values) =>
            void setParams({ [key]: values.length ? values : null, page: null } as Parameters<typeof setParams>[0]),
        }}
        onReset={() => void setParams({ q: null, status: null, cadence: null, category: null, page: null })}
      />
      <DataTable
        table={table}
        pending={isPending}
        onRowClick={(row) => open(row.key)}
        renderMobileRow={(row) => <SubscriptionMobileRow sub={row} today={data.today} />}
        renderMobileActions={(row) => (
          <SubscriptionActions sub={row} onOpen={() => open(row.key)} trigger={{ className: "size-11 data-popup-open:bg-muted" }} />
        )}
        empty={
          data.detected ? (
            "No subscriptions match these filters."
          ) : (
            <>
              No subscriptions yet. Import a statement in{" "}
              <Link href="/settings/data" className="font-medium text-foreground underline underline-offset-4">
                Settings → Data & sync
              </Link>
              .
            </>
          )
        }
      />
      <DataTablePagination table={table} total={data.total} pageSizes={PAGE_SIZES} />
    </div>
  );
}
