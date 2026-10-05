import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Skeletons mirror the real layout (same cards, same heights) so nothing jumps when data streams in.

/** The monthly total tile; it announces the loading state for the stat tiles too. */
export function MonthlyTotalSkeleton() {
  return (
    <Card role="status" aria-busy="true" aria-label="Loading totals">
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-12 w-44" />
        <Skeleton className="h-3.5 w-48" />
      </CardContent>
    </Card>
  );
}

/** One secondary stat tile (yearly, active, price increase). */
export function StatTileSkeleton() {
  return (
    <Card aria-hidden>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-3.5 w-36" />
      </CardContent>
    </Card>
  );
}

export function ChartCardSkeleton({
  height,
  legend,
  bars,
  className,
}: {
  height: number;
  legend?: boolean;
  bars?: boolean;
  className?: string;
}) {
  return (
    <Card className={className} role="status" aria-busy="true" aria-label="Loading chart">
      <CardHeader>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent>
        {legend && (
          <div className="mb-3 flex flex-wrap gap-3">
            {[56, 72, 48, 64, 80].map((w) => (
              <Skeleton key={w} className="h-3.5" style={{ width: w }} />
            ))}
          </div>
        )}
        {bars ? (
          <div className="flex flex-col gap-3.5" style={{ height }}>
            {[92, 78, 64, 55, 41, 33, 25, 18].map((w) => (
              <div key={w} className="flex items-center gap-3">
                <Skeleton className="h-3.5 w-24 shrink-0" />
                <Skeleton className="h-4" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-end gap-[3%] pl-12" style={{ height }}>
            {[40, 55, 48, 62, 58, 70, 66, 74, 69, 80, 77, 85].map((h, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder bars
              <Skeleton key={i} className="flex-1 rounded-b-none" style={{ height: `${h}%` }} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Phones: the renewals agenda list. From md: the month grid. */
export function CalendarSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className} role="status" aria-busy="true" aria-label="Loading renewals">
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 md:hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex w-[4.75rem] flex-col gap-1.5">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
        <div className="hidden grid-cols-7 gap-1.5 md:grid">
          {Array.from({ length: 35 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder cells
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function TableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <Card role="status" aria-busy="true" aria-label="Loading table">
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
