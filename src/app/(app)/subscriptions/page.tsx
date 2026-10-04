import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";
import { TableSkeleton } from "@/components/overview/skeletons";
import { PageHeader } from "@/components/shell/PageHeader";
import { SubscriptionDrawer } from "@/components/subscriptions/SubscriptionDrawer";
import { SubscriptionsTable } from "@/components/subscriptions/SubscriptionsTable";
import { getQueryClient } from "@/lib/query/client";
import { subscriptionDetailQuery, subscriptionsTableQuery } from "@/lib/query/options";
import { loadSubscriptionDrawerParams, loadSubscriptionParams } from "@/lib/search-params";
import { getSubscriptionDetail, getSubscriptionsTable } from "@/lib/server/queries";

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [filters, { sub }] = await Promise.all([loadSubscriptionParams(searchParams), loadSubscriptionDrawerParams(searchParams)]);
  const queryClient = getQueryClient();
  // Prefetch exactly the page the URL describes; the client table reads the same key.
  void queryClient.prefetchQuery({ ...subscriptionsTableQuery(filters), queryFn: () => getSubscriptionsTable(filters) });
  // A deep link (?sub=…) opens the drawer with its data already streaming.
  if (sub) void queryClient.prefetchQuery({ ...subscriptionDetailQuery(sub), queryFn: () => getSubscriptionDetail(sub) });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageHeader
        title="Subscriptions"
        description="Detected from your recurring charges. Click one for details, its charges and actions."
      />
      <Suspense fallback={<TableSkeleton rows={12} />}>
        <SubscriptionsTable />
      </Suspense>
      <SubscriptionDrawer />
    </HydrationBoundary>
  );
}
