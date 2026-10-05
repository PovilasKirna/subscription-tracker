import type { SeriesColor } from "./types";

// Palette colours are CSS custom properties (light + dark live in globals.css), never raw hex here.
// Only a colour the user picked themselves arrives as hex, and is used as-is in both themes.
/** A series colour, or any CSS colour a chart derives itself (e.g. a `color-mix()` of a slot). */
export type Paint = SeriesColor | (string & {});
export const seriesColor = (color: Paint): string =>
  typeof color === "string" ? color : color ? `var(--series-${color})` : "var(--series-other)";

/** The preset colours a user can pick for a subscription, in slot order (`--series-1` … `--series-8`). */
export const PRESET_COLORS = [
  { slot: 1, label: "Blue" },
  { slot: 2, label: "Orange" },
  { slot: 3, label: "Teal" },
  { slot: 4, label: "Amber" },
  { slot: 5, label: "Pink" },
  { slot: 6, label: "Green" },
  { slot: 7, label: "Violet" },
  { slot: 8, label: "Red" },
] as const;

export const tokens = {
  surface: "var(--surface-1)",
  grid: "var(--grid)",
  axis: "var(--axis)",
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textMuted: "var(--text-muted)",
} as const;

/** The neutral "Other" slot (no colour). Its grey sits near 2:1 on the card in light mode. */
export const isOther = (color: Paint | undefined): boolean => color === null || color === undefined;

/**
 * Stroke for "Other" marks only: a 1px graphite outline lifts the grey to 3:1+ against the card in
 * both themes without recolouring the palette. Spread onto the mark; inset the geometry by 0.5px.
 */
export const otherOutline = (color: Paint | undefined) =>
  isOther(color) ? ({ stroke: tokens.textSecondary, strokeWidth: 1 } as const) : ({} as const);

/** The keyboard focus ring drawn around a focused mark (2px ink: 15:1+ on the card in both themes). */
export const focusRing = { fill: "none", stroke: tokens.textPrimary, strokeWidth: 2, pointerEvents: "none" } as const;

/** Mark specs from the dataviz skill. */
export const marks = {
  maxBar: 24,
  radius: 4,
  gap: 2,
  line: 2,
  markerR: 4,
  ring: 2,
} as const;

/** DESIGN.md: chart text never renders below 12px. */
export const MIN_TEXT = 12;

export const axisLabel = {
  fill: tokens.textMuted,
  fontSize: MIN_TEXT,
  fontFamily: "var(--font-sans)",
  style: { fontVariantNumeric: "tabular-nums" },
} as const;

/** Truncate a label to `max` chars, keeping a " · suffix" (e.g. a plan's price) visible. */
export function fitLabel(label: string, max: number): string {
  if (label.length <= max) return label;
  const [head, tail] = label.split(" · ");
  if (tail && tail.length + 4 < max) return `${head.slice(0, max - tail.length - 4)}… · ${tail}`;
  return `${label.slice(0, max - 1)}…`;
}
