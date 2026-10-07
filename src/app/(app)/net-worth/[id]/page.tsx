import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HoldingView, HoldingViewSkeleton } from "@/components/net-worth/HoldingView";
import { getQueryClient } from "@/lib/query/client";
import { holdingQuery } from "@/lib/query/options";
import { getHoldingDetail } from "@/lib/server/queries";

export default async function HoldingPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const queryClient = getQueryClient();
  const detail = await getHoldingDetail(id);
  if (!detail) notFound();
  queryClient.setQueryData(holdingQuery(id).queryKey, detail);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<HoldingViewSkeleton />}>
        <HoldingView id={id} />
      </Suspense>
    </HydrationBoundary>
  );
}
