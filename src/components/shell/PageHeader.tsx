import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The page's `h1` and its actions. On phones the title lives in `AppNav`'s top bar, so the `h1` is
 * screen-reader only and the actions sit in a right-aligned row above the content. From `md` up it
 * is a slim sticky bar across the content column; its background and bottom border bleed sideways
 * with a clipped box-shadow (ink overflow, so it never adds horizontal scroll) and the rail paints over
 * the left side. `description` is kept for call-site compatibility and only becomes a tooltip on the title.
 */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-3",
        actions && "max-md:mb-4",
        "md:sticky md:top-0 md:z-20 md:mb-5 md:min-h-12 md:justify-between md:bg-card md:py-2",
        "md:shadow-[0_0_0_100vmax_var(--color-card),0_1px_0_100vmax_var(--color-border)] md:[clip-path:inset(0_-100vmax_-1px)]",
      )}
    >
      <h1
        className="min-w-0 truncate text-base font-semibold max-md:sr-only"
        title={typeof description === "string" ? description : undefined}
      >
        {title}
      </h1>
      {actions && <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  );
}
