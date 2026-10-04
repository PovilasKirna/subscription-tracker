import type { ColorSlot } from "./types";

// Colours are CSS custom properties (light + dark live in globals.css), never raw hex here.
export const slotColor = (slot: ColorSlot): string => (slot ? `var(--series-${slot})` : "var(--series-other)");

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

/** Mark specs from the dataviz skill. */
export const marks = {
  maxBar: 24,
  radius: 4,
  gap: 2,
  line: 2,
  markerR: 4,
  ring: 2,
} as const;

export const axisLabel = {
  fill: tokens.textMuted,
  fontSize: 11,
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
