import type { ReactNode } from "react";
import { Card, CardAction, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Card shell for a chart: an h2 title, a description, optional controls (range toggles etc.).
 * On a narrow card the controls get their own row under the description, so the title and
 * description keep the full width; from 28rem of card width they sit in the header's action slot.
 */
export function ChartCard({
  title,
  description,
  controls,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("@container/chart", className)}>
      <CardHeader className="has-data-[slot=card-action]:grid-cols-1 @md/chart:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
        {/* Styled exactly as CardTitle; an h2 so the page has a heading outline. */}
        <h2 data-slot="card-title" className="font-heading text-base leading-snug font-medium">
          {title}
        </h2>
        {description && <CardDescription>{description}</CardDescription>}
        {controls && (
          <CardAction className="col-start-1 row-span-1 row-start-auto mt-1.5 flex flex-wrap items-center gap-2 justify-self-start @md/chart:col-start-2 @md/chart:row-span-2 @md/chart:row-start-1 @md/chart:mt-0 @md/chart:justify-self-end">
            {controls}
          </CardAction>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
