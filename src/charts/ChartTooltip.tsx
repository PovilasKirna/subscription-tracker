"use client";

import { type TooltipInPortalProps, useTooltip, useTooltipInPortal } from "@visx/tooltip";
import type { FC, ReactNode } from "react";
import { type Paint, seriesColor } from "./palette";

/**
 * useTooltip<T> plus a portal: ParentSize clips its children (overflow: hidden), so tooltips
 * render into document.body and are positioned from the container's bounds.
 */
export function useChartTooltip<T>() {
  const tooltip = useTooltip<T>();
  const { containerRef, TooltipInPortal } = useTooltipInPortal({ detectBounds: true, scroll: true });
  return { ...tooltip, containerRef, TooltipInPortal };
}

export function ChartTooltip({
  Portal,
  left,
  top,
  children,
}: {
  Portal: FC<TooltipInPortalProps>;
  left?: number;
  top?: number;
  children: ReactNode;
}) {
  return (
    <Portal left={left} top={top} offsetLeft={14} offsetTop={14} unstyled applyPositionStyle className="visx-tooltip-panel">
      {children}
    </Portal>
  );
}

/** A row inside a tooltip: colour key beside the text; the text stays in text tokens. */
export function TooltipRow({ color, label, value, strong }: { color?: Paint; label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-[var(--text-secondary)]">
      {color !== undefined && <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: seriesColor(color) }} />}
      <span className={strong ? "font-medium text-[var(--text-primary)]" : "truncate"}>{label}</span>
      <span className="tabular ml-auto pl-4 font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
