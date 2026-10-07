import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { TransactionsTable, TransactionsTableSkeleton } from "@/components/transactions/TransactionsTable";
import { categoryLookup } from "@/lib/categories";
import { getQueryClient } from "@/lib/query/client";
import { transactionsQuery } from "@/lib/query/options";
import { loadTransactionParams } from "@/lib/search-params";
import { getCategories, getTransactions } from "@/lib/server/queries";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [raw, { categories }] = await Promise.all([loadTransactionParams(searchParams), getCategories()]);
  // A category since hidden or deleted is left out, as the table does: the prefetch and the
  // client's query key must agree, or the table would fetch on its own during server rendering.
  const filters = { ...raw, category: raw.category.filter(categoryLookup(categories).selectable) };
  const queryClient = getQueryClient();
  // Prefetch exactly the page the URL describes; the client table reads the same key.
  void queryClient.prefetchQuery({ ...transactionsQuery(filters), queryFn: () => getTransactions(filters) });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageHeader title="Transactions" />
      <Suspense fallback={<TransactionsTableSkeleton />}>
        <TransactionsTable />
      </Suspense>
    </HydrationBoundary>
  );
}
