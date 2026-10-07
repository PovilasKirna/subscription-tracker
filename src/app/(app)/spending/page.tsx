import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { SpendingControls, SpendingView, SpendingViewSkeleton } from "@/components/spending/SpendingView";
import { getQueryClient } from "@/lib/query/client";
import { spendingQuery } from "@/lib/query/options";
import { loadSpendingParams } from "@/lib/search-params";
import { getSpending } from "@/lib/server/queries";

export default async function SpendingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { range, at } = await loadSpendingParams(searchParams);
  const queryClient = getQueryClient();
  void queryClient.prefetchQuery({ ...spendingQuery(range, at), queryFn: () => getSpending(range, at) });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageHeader
        title="Spending"
        description="Where your money went, how it compares with the period before, and where it's heading."
        actions={
          <Suspense fallback={null}>
            <SpendingControls />
          </Suspense>
        }
      />
      <Suspense fallback={<SpendingViewSkeleton />}>
        <SpendingView />
      </Suspense>
    </HydrationBoundary>
  );
}
