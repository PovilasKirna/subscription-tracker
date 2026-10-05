import { TableSkeleton } from "@/components/overview/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Shown instantly on client navigation while the next page's server component starts streaming.
// Mirrors PageHeader: phones already name the page in the top bar; from md a slim bar holds the title.
export default function Loading() {
  return (
    <div aria-busy="true">
      <div className="mb-5 hidden min-h-12 items-center bg-card py-2 shadow-[0_0_0_100vmax_var(--color-card),0_1px_0_100vmax_var(--color-border)] [clip-path:inset(0_-100vmax_-1px)] md:sticky md:top-0 md:z-20 md:flex">
        <Skeleton className="h-5 w-32" />
      </div>
      <TableSkeleton rows={10} />
    </div>
  );
}
