import { TableSkeleton } from "@/components/overview/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Shown instantly on client navigation while the next page's server component starts streaming.
export default function Loading() {
  return (
    <div aria-busy="true">
      <div className="mb-5 flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <TableSkeleton rows={10} />
    </div>
  );
}
