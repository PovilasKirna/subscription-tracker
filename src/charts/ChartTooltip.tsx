"use client";

import { type TooltipInPortalProps, useTooltip, useTooltipInPortal } from "@visx/tooltip";
import { type FC, type FocusEvent, type KeyboardEvent, type ReactNode, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { isOther, type Paint, seriesColor } from "./palette";

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
  // visx's Portal appends its node during render and removes it on unmount. React StrictMode (dev)
  // fakes one unmount/remount after mounting, which leaves the first tooltip in a detached node until
  // something re-renders (hover does, keyboard focus does not). One re-render after mount recreates it.
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => refresh(), []);
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
      {color !== undefined && (
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

/** Which arrow keys step backwards / forwards through a chart's marks. */
export type NavKeys = { prev: readonly string[]; next: readonly string[] };
export const ANY_ARROW: NavKeys = { prev: ["ArrowLeft", "ArrowUp"], next: ["ArrowRight", "ArrowDown"] };

/**
 * Roving focus: the chart is one tab stop, the arrow keys (plus Home / End) move DOM focus between
 * its marks, so a screen reader reads each mark's name as it lands. `initial` is the mark Tab enters
 * on until the user picks another. `focused` / `ringVisible` drive the drawn focus ring, which only
 * shows for keyboard focus (`:focus-visible`), never for a mouse click.
 */
export function useRovingFocus(count: number, initial = 0) {
  const [active, setActive] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [ringVisible, setRingVisible] = useState(false);
  const els = useRef<(SVGElement | null)[]>([]);
  const clamp = (i: number) => Math.min(Math.max(i, 0), count - 1);
  const current = count > 0 ? clamp(active ?? initial) : -1;

  const ref = useCallback(
    (i: number) => (el: SVGElement | null) => {
      els.current[i] = el;
    },
    [],
  );
  const focusIndex = (i: number) => {
    if (count > 0) els.current[clamp(i)]?.focus();
  };
  const onFocus = (i: number, e: FocusEvent<SVGElement>) => {
    setActive(i);
    setFocused(i);
    let visible = true;
    try {
      visible = e.currentTarget.matches(":focus-visible");
    } catch {}
    setRingVisible(visible);
  };
  /** True when focus left the chart entirely (not just moved to a sibling mark). */
  const onBlur = (e: FocusEvent<SVGElement>) => {
    const next = e.relatedTarget as SVGElement | null;
    if (next && els.current.includes(next)) return false;
    setFocused(null);
    return true;
  };
  /** Arrow / Home / End handling; returns true when the key moved focus. */
  const onKeyDown = (i: number, e: KeyboardEvent<SVGElement>, keys: NavKeys = ANY_ARROW) => {
    const next = keys.prev.includes(e.key)
      ? i - 1
      : keys.next.includes(e.key)
        ? i + 1
        : e.key === "Home"
          ? 0
          : e.key === "End"
            ? count - 1
            : null;
    if (next === null) return false;
    e.preventDefault();
    focusIndex(next);
    return true;
  };
  return {
    ref,
    tabIndex: (i: number) => (i === current ? 0 : -1),
    focusIndex,
    onFocus,
    onBlur,
    onKeyDown,
    focused,
    ringVisible: focused !== null && ringVisible,
  };
}
