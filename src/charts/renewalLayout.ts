// Pure layout maths for RenewalCalendar's day cells, kept apart from the component so it can be tested.

/** Height of the weekday header row above the grid. */
export const HEADER = 22;
/** Cell height over cell width: 1 draws square days. */
export const CELL_ASPECT = 1;
/** Space between two days, across and down: tighter on phone-width grids so the cells keep their room. */
export const cellGap = (width: number) => (width < 400 ? 4 : 6);

/** Day-cell size and total height for a grid `width` px wide with `rows` weeks. */
export function gridSize(width: number, rows: number) {
  const gap = cellGap(width);
  const cellW = Math.max(0, (width - 6 * gap) / 7);
  const cellH = cellW * CELL_ASPECT;
  return { gap, cellW, cellH, height: HEADER + rows * cellH + (rows - 1) * gap };
}

/** Baseline of the day number, from the cell's top: raised in the compact (phone) cells. */
export const dayBaseline = (cellW: number) => (cellW < 40 ? 13 : 16);
/** Least space between the day number's baseline and the top of the logo row (digits have no descenders). */
export const MIN_GLYPH_GAP = 2;
/** Gap between a day's logo row and the bottom of its cell: tighter in the compact cells. */
export const logoBottom = (cellW: number) => (cellW < 40 ? 3 : 6);

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
 * card (~41px cells at 343px), 12px on the narrowest phones (~33px cells at 320px), 14px between.
 */
export const logoSize = (cellW: number) => (cellW >= 64 ? 20 : cellW >= 40 ? 16 : cellW >= 36 ? 14 : 12);

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
