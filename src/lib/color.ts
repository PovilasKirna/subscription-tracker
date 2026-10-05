// Subscription colours, shared by the API route, the detector and the picker.

/** Preset palette slots a user can pick (`--series-1` … `--series-8`). */
export const COLOR_SLOTS = 8;

/** A custom colour, `#rrggbb`. */
export type HexColor = `#${string}`;

/** How a subscription is painted: a palette slot (1–8), a custom colour, or null for the neutral "Other" grey. */
export type SeriesColor = number | HexColor | null;

/** What the user can pick: a palette slot, a custom colour, or "none" (neutral grey, folded into "Other"). */
export type ColorChoice = number | HexColor | "none";

export const isColorSlot = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= COLOR_SLOTS;

export const isHexColor = (v: unknown): v is HexColor => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

export const isColorChoice = (v: unknown): v is ColorChoice => v === "none" || isColorSlot(v) || isHexColor(v);
