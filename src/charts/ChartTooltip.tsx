"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { isOther, type Paint, seriesColor } from "./palette";

// Tooltip bodies are React content mounted into @tanstack/charts' native tooltip surface (see
// `chartTooltip` in theme.ts and the `renderTooltipBody` prop); the surface itself is styled by
// `.chart-tooltip` in globals.css.

/**
 * The same tooltip surface for app-owned layouts that are not a chart definition (RenewalCalendar):
 * portalled to <body> so a card's `overflow: hidden` never clips it, placed beside `anchor` (a viewport
 * rect) and flipped to stay on screen.
 */
export function FloatingTooltip({ anchor, children }: { anchor: DOMRect; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const offset = 14;
    const { width, height } = el.getBoundingClientRect();
    const x = anchor.left + anchor.width / 2;
    const y = anchor.top + anchor.height / 2;
    const left = x + offset + width <= window.innerWidth - 8 ? x + offset : Math.max(8, x - offset - width);
    const top = y + offset + height <= window.innerHeight - 8 ? y + offset : Math.max(8, y - offset - height);
    setPos({ left, top });
  }, [anchor]);
  return createPortal(
    <div
      ref={ref}
      aria-hidden
      className="chart-tooltip chart-tooltip-floating"
      style={pos ?? { left: anchor.left, top: anchor.top, visibility: "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** A row inside a tooltip: colour key beside the text; the text stays in text tokens. */
export function TooltipRow({
  color,
  icon,
  label,
  value,
  strong,
}: {
  color?: Paint;
  /** Shown in place of the colour swatch, e.g. a merchant logo. */
  icon?: ReactNode;
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-[var(--text-secondary)]">
      {icon}
      {icon === undefined && color !== undefined && (
        <span
          className={cn("size-2.5 shrink-0 rounded-[3px]", isOther(color) && "border border-[var(--text-secondary)]")}
          style={{ background: seriesColor(color) }}
        />
      )}
      <span className={strong ? "font-medium text-[var(--text-primary)]" : "truncate"}>{label}</span>
      <span className="tabular ml-auto pl-4 font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

/** The hairline between a tooltip's heading row and its breakdown. */
export function TooltipDivider() {
  return <div className="my-1.5 h-px bg-[var(--grid)]" />;
}

/** A muted footnote line at the bottom of a tooltip. */
export function TooltipNote({ children }: { children: ReactNode }) {
  return <div className="mt-1 text-xs text-[var(--text-muted)]">{children}</div>;
}
