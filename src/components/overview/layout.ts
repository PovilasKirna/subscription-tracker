import type { WidgetDef, WidgetSize } from "./widgets";

// Grid placement for the Overview widgets. Breakpoints are container queries on the widget area,
// not the viewport, because the 224px rail takes a different share of each screen:
// - under 32rem (phones, tablet portrait): 2 columns; stat tiles pair up, everything else is full width.
// - 32rem to 56rem (tablet landscape, small laptops): 2 columns; every small tile is half the row.
// - 56rem and up (about 1184px wide windows): 4 columns; small = a quarter, half = half, full = the row.
// Dense flow back-fills the holes a removed or resized tile would leave.

/** On the element wrapping WIDGET_GRID; an element can't query its own size. */
export const WIDGET_AREA = "@container/widgets";
export const WIDGET_GRID = "grid grid-flow-row-dense grid-cols-2 gap-4 @4xl/widgets:grid-cols-4";

export function widgetSpan(def: WidgetDef, size: WidgetSize): string {
  if (size === "full") return "col-span-2 @4xl/widgets:col-span-4";
  if (size === "half") return "col-span-2";
  return def.wideOnPhone ? "col-span-2 @lg/widgets:col-span-1" : "col-span-1";
}

/**
 * Where a size toggle changes anything. Half and full only differ on the 4-column grid; a wide-on-phone
 * tile is full width on phones whatever its size.
 */
export function sizeToggleVisibility(def: WidgetDef): string {
  if (!def.sizes.includes("small")) return "hidden @4xl/widgets:flex";
  return def.wideOnPhone ? "hidden @lg/widgets:flex" : "flex";
}
