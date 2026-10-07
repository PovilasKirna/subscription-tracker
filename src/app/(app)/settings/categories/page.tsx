import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Suspense } from "react";
import { CategoriesManager, CategoriesSkeleton } from "@/components/settings/CategoriesManager";
import { SectionHeader } from "@/components/settings/SettingsNav";
import { getQueryClient } from "@/lib/query/client";
import { categoryUsageQuery } from "@/lib/query/options";
import { getCategoryUsage } from "@/lib/server/queries";

export default function CategorySettingsPage() {
  const queryClient = getQueryClient();
  // The categories themselves are prefetched by the app layout.
  void queryClient.prefetchQuery({ ...categoryUsageQuery(), queryFn: getCategoryUsage });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SectionHeader href="/settings/categories" />
      <Suspense fallback={<CategoriesSkeleton />}>
        <CategoriesManager />
      </Suspense>
    </HydrationBoundary>
  );
}
