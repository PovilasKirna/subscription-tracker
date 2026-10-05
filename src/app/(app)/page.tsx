import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";
import { SyncStatus, SyncStatusSkeleton } from "@/components/data/SyncStatus";
import { EditOverviewButton, OverviewWidgets } from "@/components/overview/OverviewWidgets";
import { OnboardingBanner } from "@/components/overview/sections";
import { PageHeader } from "@/components/shell/PageHeader";
import { getQueryClient } from "@/lib/query/client";
import { historyQuery, statusQuery, subscriptionsQuery } from "@/lib/query/options";
import { loadOverviewParams } from "@/lib/search-params";
import { getDataStatus, getHistory, getSubscriptions } from "@/lib/server/queries";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { range } = await loadOverviewParams(searchParams);
  const queryClient = getQueryClient();
  // Not awaited: pending queries are dehydrated and streamed; each <Suspense> resolves on its own.
  void queryClient.prefetchQuery({ ...subscriptionsQuery(), queryFn: getSubscriptions });
  void queryClient.prefetchQuery({ ...historyQuery(range), queryFn: () => getHistory(range) });
  void queryClient.prefetchQuery({ ...statusQuery(), queryFn: getDataStatus });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageHeader
        title="Overview"
        description="What your recurring payments cost, and what's coming up."
        actions={
          <>
            <EditOverviewButton />
            <Suspense fallback={<SyncStatusSkeleton />}>
              <SyncStatus />
            </Suspense>
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <Suspense fallback={null}>
          <OnboardingBanner />
        </Suspense>
        {/* The widgets, in this device's order; each streams in behind its own Suspense boundary. */}
        <OverviewWidgets />
      </div>
    </HydrationBoundary>
  );
}
