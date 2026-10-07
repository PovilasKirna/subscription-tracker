import type { ChartGuideLineStyle } from "@tanstack/charts";
import { tooltip } from "@tanstack/charts/tooltip";
import { portal } from "@tanstack/charts/tooltip/portal";
import { MIN_TEXT, tokens } from "./palette";

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

/** Keyboard focus is drawn by the marks themselves (bands, rings), so the default dot ring is off. */
export const focusRing = false;

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
