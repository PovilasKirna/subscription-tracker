// Grid placement shared by the Overview sections and their skeletons, so nothing jumps when data streams in.
// DOM order is the phone reading order; from `lg` the cells are placed explicitly.

/** Stat row: the monthly total (a little wider) and three stat tiles. Phones: total and the price increase span both columns. */
export const TOP_GRID = "grid grid-cols-2 gap-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr]";
export const TOP_SLOT = {
  hero: "col-span-2 lg:col-span-1",
  yearly: "",
  active: "",
  increase: "col-span-2 lg:col-span-1",
} as const;

/** Spend + renewals row. Phones see renewals first (what's about to charge); desktop keeps spend on the left. */
export const CHART_GRID = "grid gap-4 lg:grid-cols-[1.55fr_1fr]";
export const CHART_SLOT = {
  renewals: "lg:col-start-2 lg:row-start-1",
  spend: "lg:col-start-1 lg:row-start-1",
} as const;
