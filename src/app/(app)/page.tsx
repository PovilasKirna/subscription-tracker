import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";
import { SyncStatus, SyncStatusSkeleton } from "@/components/data/SyncStatus";
import { CHART_GRID, CHART_SLOT, TOP_GRID } from "@/components/overview/layout";
import { MonthlyTotalTile, StatTiles } from "@/components/overview/StatTiles";
import { MerchantSection, OnboardingBanner, RenewalsSection, SpendSection, TimelineSection } from "@/components/overview/sections";
import { CalendarSkeleton, ChartCardSkeleton, MonthlyTotalSkeleton, StatTilesSkeleton } from "@/components/overview/skeletons";
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
          <Suspense fallback={<SyncStatusSkeleton />}>
            <SyncStatus />
          </Suspense>
        }
      />
      <div className="flex flex-col gap-4">
        <Suspense fallback={null}>
          <OnboardingBanner />
        </Suspense>
        {/* Stat row: monthly total (the one hero figure) and three stats. */}
        <div className={TOP_GRID}>
          <Suspense fallback={<MonthlyTotalSkeleton />}>
            <MonthlyTotalTile />
          </Suspense>
          <Suspense fallback={<StatTilesSkeleton />}>
            <StatTiles />
          </Suspense>
        </div>
        {/* Renewals come first in the DOM (phones read them before the spend chart); desktop places spend left. */}
        <div className={CHART_GRID}>
          <Suspense fallback={<CalendarSkeleton className={CHART_SLOT.renewals} />}>
            <RenewalsSection />
          </Suspense>
          <Suspense fallback={<ChartCardSkeleton height={340} legend className={CHART_SLOT.spend} />}>
            <SpendSection />
          </Suspense>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
          <Suspense fallback={<ChartCardSkeleton height={420} />}>
            <TimelineSection />
          </Suspense>
          <Suspense fallback={<ChartCardSkeleton height={360} bars />}>
            <MerchantSection />
          </Suspense>
        </div>
      </div>
    </HydrationBoundary>
  );
}
