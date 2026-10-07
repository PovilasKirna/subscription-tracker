import type { ChartGuideLineStyle } from "@tanstack/charts";
import { tooltip } from "@tanstack/charts/tooltip";
import { portal } from "@tanstack/charts/tooltip/portal";
import { MIN_TEXT, marks, tokens } from "./palette";

// Shared @tanstack/charts presentation: every chart pulls its theme, guide styles and tooltip
// options from here, so the charts read as one system in both light and dark mode.

/** Scene colours come from the app's CSS tokens (globals.css), never from currentColor. */
export const chartTheme = {
  foreground: tokens.textPrimary,
  muted: tokens.textMuted,
  grid: tokens.grid,
  background: "transparent",
} as const;

export const gridLine: ChartGuideLineStyle = { stroke: tokens.grid, strokeOpacity: 1, strokeWidth: 1 };
export const axisLine: ChartGuideLineStyle = { stroke: tokens.axis, strokeOpacity: 1, strokeWidth: 1 };

/** DESIGN.md: chart text never renders below 12px; the muted ink comes from the theme. */
export const tickLabels = { fontSize: MIN_TEXT } as const;

/** About six evenly spaced indices out of `count` points, always including the last one. */
export function indexTicks(count: number): number[] {
  const last = count - 1;
  const every = Math.max(1, Math.round(count / 6));
  return Array.from({ length: count }, (_, i) => i).filter((i) => i === last || (i % every === 0 && last - i >= every / 2));
}

/**
 * Band charts (columns, rows) draw their own keyboard ring around the focused band (`keyboardRing` in
 * keyboardEntry.ts), so the library's dot ring is off for them.
 */
export const focusRing = false;

/**
 * Line charts: the focused day gets a 2px ink ring (DESIGN.md), hollow so a marker inside stays visible.
 * Dot options for a `whenFocused(dot(...), { match: "x" })` on the chart's main line: the library's own
 * ring would circle every series (and label) at that day.
 */
export const inkRing = { r: marks.markerR + 2, fill: "transparent", stroke: tokens.textPrimary, strokeWidth: 2 } as const;

/**
 * The tooltip follows the pointer (keyboard focus falls back to the mark), escapes the card's
 * `overflow: hidden` through the portal, and never pins: every chart here is read-only.
 */
export const chartTooltip = {
  use: tooltip,
  portal,
  className: "chart-tooltip",
  anchor: "pointer",
  placement: ["bottom-right", "top-right", "bottom-left", "top-left"],
  offset: 14,
  sticky: false,
} as const;
