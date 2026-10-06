// Pure layout maths for RenewalCalendar's day cells, kept apart from the component so it can be tested.

/** Inset of the logo row from the cell's left edge. */
export const LOGO_PAD = 3;
/** Space between two logos. */
export const LOGO_GAP = 2;
/** Width kept for the "+k" overflow label (MIN_TEXT, up to two digits after the plus). */
export const MORE_W = 14;
/** Most logos a day shows, however wide the cell; the rest fold into "+k" and the day's tooltip. */
export const MAX_LOGOS = 2;

/**
 * Logo size for a day cell of width `cellW`: 20px where amounts fit too (desktop), 16px on a phone
 * card (~41px cells at 343px), 14px on the narrowest phones (~34px cells at 320px).
 */
export const logoSize = (cellW: number) => (cellW >= 64 ? 20 : cellW >= 40 ? 16 : 14);

/**
 * How many of a day's `count` charges get a logo, and how many fold into "+k". At most `MAX_LOGOS`
 * show, and every logo fits inside the cell; when they don't all fit, the last slot gives way to the
 * "+k" label, but at least one logo always shows.
 */
export function dayLogoLayout(cellW: number, count: number): { size: number; shown: number; more: number } {
  const size = logoSize(cellW);
  const room = cellW - 2 * LOGO_PAD + LOGO_GAP;
  const fit = Math.min(MAX_LOGOS, Math.max(1, Math.floor(room / (size + LOGO_GAP))));
  if (count <= fit) return { size, shown: count, more: 0 };
  const shown = Math.min(MAX_LOGOS, Math.max(1, Math.floor((room - MORE_W) / (size + LOGO_GAP))));
  return { size, shown, more: count - shown };
}

/** Left edge of the `k`th logo in a cell. */
export const logoX = (size: number, k: number) => LOGO_PAD + k * (size + LOGO_GAP);
