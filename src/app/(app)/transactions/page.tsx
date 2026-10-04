import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { TransactionsTable, TransactionsTableSkeleton } from "@/components/transactions/TransactionsTable";
import { getQueryClient } from "@/lib/query/client";
import { transactionsQuery } from "@/lib/query/options";
import { loadTransactionParams } from "@/lib/search-params";
import { getTransactions } from "@/lib/server/queries";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const filters = await loadTransactionParams(searchParams);
  const queryClient = getQueryClient();
  // Prefetch exactly the page the URL describes; the client table reads the same key.
  void queryClient.prefetchQuery({ ...transactionsQuery(filters), queryFn: () => getTransactions(filters) });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageHeader
        title="Transactions"
        description="Search, filter and sort everything imported. Use a row's menu to track or untrack a subscription."
      />
      <Suspense fallback={<TransactionsTableSkeleton />}>
        <TransactionsTable />
      </Suspense>
    </HydrationBoundary>
  );
}
