// The Overview widget model: which widgets exist, the sizes each may take, and the default layout.
// Pure functions only (no React, no storage), so the layout rules are unit-tested on their own;
// widget-store.ts persists a layout per device and OverviewWidgets.tsx renders it.

/**
 * small: a stat tile (a quarter of the row on wide screens, half of it on phones).
 * half: half the row on wide screens. full: the whole row. Phones show half and full widgets full width.
 */
export type WidgetSize = "small" | "half" | "full";

export type WidgetId = "monthly-total" | "yearly" | "active" | "price-increase" | "renewals" | "spend" | "timeline" | "merchants";

export type WidgetDef = {
  id: WidgetId;
  title: string;
  /** One line for the "Add widget" list. */
  description: string;
  /** In the order the size toggle steps through them. */
  sizes: readonly WidgetSize[];
  defaultSize: WidgetSize;
  /** A small tile too wide for half a phone (a Display figure, a long subline): it takes the whole row there. */
  wideOnPhone?: boolean;
};

export type LayoutItem = { id: WidgetId; size: WidgetSize };
export type Layout = readonly LayoutItem[];

export const WIDGETS: readonly WidgetDef[] = [
  {
    id: "monthly-total",
    title: "Monthly total",
    description: "What your subscriptions cost each month, and what's due in the next 30 days.",
    sizes: ["small", "half"],
    defaultSize: "small",
    wideOnPhone: true,
  },
  {
    id: "yearly",
    title: "Yearly projection",
    description: "A year of today's prices.",
    sizes: ["small", "half"],
    defaultSize: "small",
  },
  {
    id: "active",
    title: "Active subscriptions",
    description: "How many are charging, and which are overdue.",
    sizes: ["small", "half"],
    defaultSize: "small",
  },
  {
    id: "price-increase",
    title: "Biggest price increase",
    description: "The largest price rise in the last 12 months.",
    sizes: ["small", "half"],
    defaultSize: "small",
    wideOnPhone: true,
  },
  {
    id: "renewals",
    title: "Upcoming renewals",
    description: "This month's expected charges, as a list or a calendar.",
    sizes: ["half", "full"],
    defaultSize: "half",
  },
  {
    id: "spend",
    title: "Monthly recurring spend",
    description: "Monthly spend over the last 12 months or this year, stacked by subscription.",
    sizes: ["half", "full"],
    defaultSize: "half",
  },
  {
    id: "timeline",
    title: "Subscription timeline",
    description: "Every charge and price change, one row per subscription.",
    sizes: ["half", "full"],
    defaultSize: "full",
  },
  {
    id: "merchants",
    title: "Spend by merchant",
    description: "Who you paid most, and what was subsidised.",
    sizes: ["half", "full"],
    defaultSize: "full",
  },
];

const BY_ID = new Map<string, WidgetDef>(WIDGETS.map((w) => [w.id, w]));

export function widgetDef(id: WidgetId): WidgetDef {
  // Every WidgetId is in WIDGETS; the cast only satisfies the Map lookup.
  return BY_ID.get(id) as WidgetDef;
}

export const isWidgetId = (id: unknown): id is WidgetId => typeof id === "string" && BY_ID.has(id);

/** Stat row, then renewals beside spend, then the timeline and merchants each across the whole row. */
export const DEFAULT_LAYOUT: Layout = WIDGETS.map((w) => ({ id: w.id, size: w.defaultSize }));

/** A size the widget allows; anything else falls back to its default. */
export function clampSize(id: WidgetId, size: unknown): WidgetSize {
  const def = widgetDef(id);
  return def.sizes.includes(size as WidgetSize) ? (size as WidgetSize) : def.defaultSize;
}

/**
 * A stored layout, validated: unknown ids and repeats are dropped, sizes clamped to what each widget
 * allows. Anything that isn't a layout at all (bad JSON, the wrong shape) gives the default. An empty
 * array is a real choice (every widget removed) and stays empty.
 */
export function parseLayout(raw: string | null | undefined): Layout {
  if (raw == null) return DEFAULT_LAYOUT;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return DEFAULT_LAYOUT;
  }
  if (!Array.isArray(value)) return DEFAULT_LAYOUT;
  const seen = new Set<WidgetId>();
  const out: LayoutItem[] = [];
  for (const item of value) {
    const id = typeof item === "object" && item !== null ? (item as { id?: unknown }).id : undefined;
    if (!isWidgetId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, size: clampSize(id, (item as { size?: unknown }).size) });
  }
  // Every entry was junk: treat it as unreadable rather than as "removed everything".
  if (value.length > 0 && out.length === 0) return DEFAULT_LAYOUT;
  return out;
}

export const serializeLayout = (layout: Layout) => JSON.stringify(layout);

/** Widgets not on the layout, in registry order: what "Add widget" offers. */
export function hiddenWidgets(layout: Layout): WidgetDef[] {
  const shown = new Set(layout.map((w) => w.id));
  return WIDGETS.filter((w) => !shown.has(w.id));
}

/** Appends the widget at its default size; a widget already shown is left where it is. */
export function addWidget(layout: Layout, id: WidgetId): Layout {
  if (layout.some((w) => w.id === id)) return layout;
  return [...layout, { id, size: widgetDef(id).defaultSize }];
}

export function removeWidget(layout: Layout, id: WidgetId): Layout {
  return layout.filter((w) => w.id !== id);
}

/** Moves the item at `from` to index `to` (clamped to the list); out-of-range `from` is a no-op. */
export function moveWidget(layout: Layout, from: number, to: number): Layout {
  if (from < 0 || from >= layout.length) return layout;
  const target = Math.min(Math.max(to, 0), layout.length - 1);
  if (target === from) return layout;
  const next = [...layout];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

/** Sets a widget's size, clamped to the sizes it allows. */
export function resizeWidget(layout: Layout, id: WidgetId, size: WidgetSize): Layout {
  const clamped = clampSize(id, size);
  return layout.map((w) => (w.id === id && w.size !== clamped ? { ...w, size: clamped } : w));
}

/** The size after `current` in the widget's list (wrapping), for a single toggle button. */
export function nextSize(id: WidgetId, current: WidgetSize): WidgetSize {
  const { sizes } = widgetDef(id);
  return sizes[(sizes.indexOf(current) + 1) % sizes.length];
}

export const sameLayout = (a: Layout, b: Layout) => a.length === b.length && a.every((w, i) => w.id === b[i].id && w.size === b[i].size);
