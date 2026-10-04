import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Suspense } from "react";
import { BankCard } from "@/components/data/BankCard";
import { BackupCard, ImportCard, ImportLog } from "@/components/data/DataPanels";
import { TableSkeleton } from "@/components/overview/skeletons";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getQueryClient } from "@/lib/query/client";
import { statusQuery } from "@/lib/query/options";
import { getDataStatus } from "@/lib/server/queries";

function PanelSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <Card aria-busy="true">
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {Array.from({ length: lines }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder lines
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

export default function DataPage() {
  const queryClient = getQueryClient();
  void queryClient.prefetchQuery({ ...statusQuery(), queryFn: getDataStatus });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageHeader title="Data & sync" description="Bring in transactions from Revolut, keep them in sync, and own your backups." />
      <div className="grid gap-4 lg:grid-cols-2">
        <ImportCard />
        <Suspense fallback={<PanelSkeleton lines={4} />}>
          <BankCard />
        </Suspense>
        <Suspense fallback={<TableSkeleton rows={4} />}>
          <ImportLog />
        </Suspense>
        <Suspense fallback={<PanelSkeleton lines={2} />}>
          <BackupCard />
        </Suspense>
      </div>
    </HydrationBoundary>
  );
}
