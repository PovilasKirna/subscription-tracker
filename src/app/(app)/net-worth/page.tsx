import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Suspense } from "react";
import { NetWorthView, NetWorthViewSkeleton, RefreshButton } from "@/components/net-worth/NetWorthView";
import { PageHeader } from "@/components/shell/PageHeader";
import { getQueryClient } from "@/lib/query/client";
import { netWorthQuery } from "@/lib/query/options";
import { getNetWorth } from "@/lib/server/netWorth";

export default function NetWorthPage() {
  const queryClient = getQueryClient();
  void queryClient.prefetchQuery({ ...netWorthQuery(), queryFn: getNetWorth });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageHeader
        title="Net worth"
        description="What you have across your bank and brokerage accounts."
        actions={
          <Suspense fallback={null}>
            <RefreshButton />
          </Suspense>
        }
      />
      <Suspense fallback={<NetWorthViewSkeleton />}>
        <NetWorthView />
      </Suspense>
    </HydrationBoundary>
  );
}
