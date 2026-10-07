import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Suspense } from "react";
import { InvestmentsView, InvestmentsViewSkeleton } from "@/components/net-worth/InvestmentsView";
import { RefreshButton } from "@/components/net-worth/NetWorthView";
import { PageHeader } from "@/components/shell/PageHeader";
import { getQueryClient } from "@/lib/query/client";
import { investmentsQuery, netWorthQuery } from "@/lib/query/options";
import { getInvestments, getNetWorth } from "@/lib/server/netWorth";

export default function InvestmentsPage() {
  const queryClient = getQueryClient();
  void queryClient.prefetchQuery({ ...investmentsQuery(), queryFn: getInvestments });
  void queryClient.prefetchQuery({ ...netWorthQuery(), queryFn: getNetWorth });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageHeader
        title="Investments"
        description="Your Trading 212 portfolio: what it's worth, what you put in, and how each position is doing."
        actions={
          <Suspense fallback={null}>
            <RefreshButton />
          </Suspense>
        }
      />
      <Suspense fallback={<InvestmentsViewSkeleton />}>
        <InvestmentsView />
      </Suspense>
    </HydrationBoundary>
  );
}
