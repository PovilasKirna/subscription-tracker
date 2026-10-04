import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Skeletons mirror the real layout (same cards, same heights) so nothing jumps when data streams in.

export function StatTilesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr]" role="status" aria-busy="true" aria-label="Loading totals">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className={i === 0 ? "col-span-2 lg:col-span-1" : undefined}>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className={i === 0 ? "h-12 w-44" : "h-7 w-24"} />
            <Skeleton className="h-3.5 w-36" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ChartCardSkeleton({ height, legend, bars }: { height: number; legend?: boolean; bars?: boolean }) {
  return (
    <Card role="status" aria-busy="true" aria-label="Loading chart">
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

export function CalendarSkeleton() {
  return (
    <Card role="status" aria-busy="true" aria-label="Loading renewals">
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1.5">
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
