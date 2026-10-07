import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Suspense } from "react";
import { Connections } from "@/components/data/Connections";
import { BackupCard, ImportCard, ImportLog } from "@/components/data/DataPanels";
import { TableSkeleton } from "@/components/overview/skeletons";
import { SectionHeader } from "@/components/settings/SettingsNav";
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
        <Skeleton className="h-4 w-72 max-w-full" />
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

export default function DataSettingsPage() {
  const queryClient = getQueryClient();
  void queryClient.prefetchQuery({ ...statusQuery(), queryFn: getDataStatus });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SectionHeader href="/settings/data" />
      <div className="flex flex-col gap-4">
        <Suspense fallback={<PanelSkeleton lines={2} />}>
          <Connections />
        </Suspense>
        {/* Import and backup are short; they stack beside the (taller) import log instead of each taking a row. */}
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <div className="flex flex-col gap-4">
            <ImportCard />
            <Suspense fallback={<PanelSkeleton lines={2} />}>
              <BackupCard />
            </Suspense>
          </div>
          <Suspense fallback={<TableSkeleton rows={4} />}>
            <ImportLog />
          </Suspense>
        </div>
      </div>
    </HydrationBoundary>
  );
}
