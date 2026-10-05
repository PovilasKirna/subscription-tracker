"use client";

import { GripIcon, LayoutGridIcon, Maximize2Icon, Minimize2Icon, MinusIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import {
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { sizeToggleVisibility, WIDGET_AREA, WIDGET_GRID, widgetSpan } from "./layout";
import { ActiveTile, MonthlyTotalTile, PriceIncreaseTile, YearlyTile } from "./StatTiles";
import { MerchantSection, RenewalsSection, SpendSection, TimelineSection } from "./sections";
import { CalendarSkeleton, ChartCardSkeleton, MonthlyTotalSkeleton, StatTileSkeleton } from "./skeletons";
import { setEditing, setLayout, useEditingOverview, useOverviewLayout } from "./widget-store";
import {
  addWidget,
  DEFAULT_LAYOUT,
  hiddenWidgets,
  type Layout,
  moveWidget,
  nextSize,
  removeWidget,
  resizeWidget,
  sameLayout,
  type WidgetId,
  type WidgetSize,
  widgetDef,
} from "./widgets";

// The Overview as a grid of widgets the owner can rearrange per device, home-screen style: Edit makes
// the widgets wiggle, each gets a minus badge (remove), a grip (drag, or arrow keys) and, where it has
// more than one size, a resize badge; "Add widget" brings back what was removed.

/** What each widget renders, and the skeleton its Suspense boundary shows while the data streams in. */
const RENDER: Record<WidgetId, { Component: ComponentType; fallback: ReactNode }> = {
  "monthly-total": { Component: MonthlyTotalTile, fallback: <MonthlyTotalSkeleton /> },
  yearly: { Component: YearlyTile, fallback: <StatTileSkeleton /> },
  active: { Component: ActiveTile, fallback: <StatTileSkeleton /> },
  "price-increase": { Component: PriceIncreaseTile, fallback: <StatTileSkeleton /> },
  renewals: { Component: RenewalsSection, fallback: <CalendarSkeleton /> },
  spend: { Component: SpendSection, fallback: <ChartCardSkeleton height={340} legend /> },
  timeline: { Component: TimelineSection, fallback: <ChartCardSkeleton height={420} /> },
  merchants: { Component: MerchantSection, fallback: <ChartCardSkeleton height={360} bars /> },
};

const SIZE_NAME: Record<WidgetSize, string> = { small: "small", half: "half width", full: "full width" };
const SIZE_RANK: Record<WidgetSize, number> = { small: 0, half: 1, full: 2 };

/** Wiggle amplitude: wide widgets turn less, so their corners move about as far as a small tile's. */
const WIGGLE: Record<WidgetSize, string> = { small: "0.6deg", half: "0.3deg", full: "0.15deg" };

const FLIP_MS = 220;
/** Touch on a widget's body waits this long before lifting it, so a swipe still scrolls the page. */
const HOLD_MS = 350;
/** Pointer travel that turns a press into a drag (mouse), or cancels a pending hold (touch). */
const MOUSE_SLOP = 4;
const TOUCH_SLOP = 8;
/** Distance from the viewport edge where a drag scrolls the page; the bottom clears the phone tab bar. */
const EDGE_TOP = 72;
const EDGE_BOTTOM = 96;

type Box = { x: number; y: number; w: number; h: number };

type Drag = {
  id: WidgetId;
  pointerId: number;
  started: boolean;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  /** Where the widget was grabbed, relative to its own top-left (grid coordinates). */
  grabX: number;
  grabY: number;
  /** Each widget's untransformed box in the grid. */
  homes: Map<WidgetId, Box>;
  /** The widget last swapped with; not swapped again until the pointer leaves it, so big/small swaps can't flicker. */
  lastSwap: WidgetId | null;
  timer: number | null;
  raf: number | null;
  cleanup: () => void;
};

type Refocus = { id: WidgetId; control: "handle" | "remove" } | "add" | null;

const prefersReducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

/**
 * The header button that switches the Overview into edit mode. While editing it is hidden (kept mounted,
 * so focus can return to it): the sticky edit bar has the Done button, and two would be redundant.
 */
export function EditOverviewButton() {
  const editing = useEditingOverview();
  return (
    <Button
      variant="outline"
      size="sm"
      className="pointer-coarse:h-11"
      data-edit-overview
      hidden={editing}
      onClick={() => setEditing(true)}
    >
      <LayoutGridIcon />
      Edit
    </Button>
  );
}

const headerEditButton = () => document.querySelector<HTMLElement>("[data-edit-overview]");

export function OverviewWidgets() {
  const stored = useOverviewLayout();
  const editing = useEditingOverview();
  // While a widget is being dragged, the order lives here and is only saved on drop.
  const [draft, setDraft] = useState<Layout | null>(null);
  const layout = draft ?? stored;
  const [dragId, setDragId] = useState<WidgetId | null>(null);
  const [adding, setAdding] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const frames = useRef(new Map<WidgetId, HTMLDivElement>());
  const drag = useRef<Drag | null>(null);
  const order = useRef<Layout>(layout);
  const flipFrom = useRef<Map<WidgetId, DOMRect> | null>(null);
  const refocus = useRef<Refocus>(null);
  const added = useRef<WidgetId | null>(null);
  const hidden = hiddenWidgets(layout);

  const frameRef = (id: WidgetId) => (el: HTMLDivElement | null) => {
    if (el) frames.current.set(id, el);
    else frames.current.delete(id);
  };

  /** Records where every widget is on screen, so the next layout change can animate from there (FLIP). */
  const capture = () => {
    if (prefersReducedMotion()) return;
    const m = new Map<WidgetId, DOMRect>();
    for (const [id, el] of frames.current) m.set(id, el.getBoundingClientRect());
    flipFrom.current = m;
  };

  const measureHomes = () => {
    const homes = new Map<WidgetId, Box>();
    // Offsets ignore transforms, so a widget mid-animation still reports where it lives.
    for (const [id, el] of frames.current) {
      if (el.offsetParent) homes.set(id, { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    }
    return homes;
  };

  const gridPoint = (clientX: number, clientY: number) => {
    const r = gridRef.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  };

  /** Moves the lifted widget under the pointer. */
  const place = () => {
    const d = drag.current;
    const el = d && frames.current.get(d.id);
    const home = d?.homes.get(d.id);
    if (!d || !el || !home) return;
    const p = gridPoint(d.clientX, d.clientY);
    el.style.translate = `${p.x - d.grabX - home.x}px ${p.y - d.grabY - home.y}px`;
  };

  /** Reorders when the pointer is over another widget's slot. */
  const hitTest = () => {
    const d = drag.current;
    if (!d) return;
    const p = gridPoint(d.clientX, d.clientY);
    let target: WidgetId | null = null;
    for (const [id, b] of d.homes) {
      if (id !== d.id && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) target = id;
    }
    if (target === null || target !== d.lastSwap) d.lastSwap = null;
    if (target === null || target === d.lastSwap) return;
    const from = order.current.findIndex((w) => w.id === d.id);
    const to = order.current.findIndex((w) => w.id === target);
    if (from < 0 || to < 0) return;
    d.lastSwap = target;
    capture();
    order.current = moveWidget(order.current, from, to);
    setDraft(order.current);
  };

  const autoscroll = () => {
    const d = drag.current;
    if (!d?.started) return;
    const h = window.innerHeight;
    const v =
      d.clientY < EDGE_TOP
        ? -Math.ceil((EDGE_TOP - d.clientY) / 4)
        : d.clientY > h - EDGE_BOTTOM
          ? Math.ceil((d.clientY - (h - EDGE_BOTTOM)) / 4)
          : 0;
    if (v) {
      window.scrollBy(0, v);
      place();
      hitTest();
    }
    d.raf = requestAnimationFrame(autoscroll);
  };

  const begin = () => {
    const d = drag.current;
    const el = d && frames.current.get(d.id);
    if (!d || !el || d.started) return;
    d.started = true;
    d.homes = measureHomes();
    const home = d.homes.get(d.id);
    const start = gridPoint(d.startX, d.startY);
    d.grabX = start.x - (home?.x ?? 0);
    d.grabY = start.y - (home?.y ?? 0);
    el.style.transition = "none";
    try {
      el.setPointerCapture(d.pointerId);
    } catch {
      // The pointer is already gone; the window listeners still end the drag.
    }
    order.current = stored;
    setDraft(stored);
    setDragId(d.id);
    place();
    navigator.vibrate?.(10);
    d.raf = requestAnimationFrame(autoscroll);
  };

  /** Ends a press or a drag. `commit` saves the new order; otherwise it snaps back. */
  const end = (commit: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    d.cleanup();
    if (d.timer !== null) window.clearTimeout(d.timer);
    if (d.raf !== null) cancelAnimationFrame(d.raf);
    if (!d.started) return;
    const el = frames.current.get(d.id);
    if (commit) {
      setLayout(order.current);
      const i = order.current.findIndex((w) => w.id === d.id);
      setAnnouncement(`${widgetDef(d.id).title} moved to position ${i + 1} of ${order.current.length}.`);
    } else {
      capture(); // the snap back animates from where everything is now, the lifted widget included
    }
    setDraft(null);
    setDragId(null);
    if (el) {
      // Dropped: glide from under the pointer into its slot (a cancelled drag is animated by the FLIP pass).
      el.style.transition = commit && !prefersReducedMotion() ? `translate ${FLIP_MS}ms cubic-bezier(0.2, 0, 0, 1)` : "none";
      el.style.translate = "";
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>, id: WidgetId) => {
    if (!editing || drag.current || e.button !== 0) return;
    const control = (e.target as Element).closest("[data-widget-control]");
    const onHandle = control?.getAttribute("data-widget-control") === "handle";
    if (control && !onHandle) return; // the remove / resize badges are plain buttons
    const touchBody = e.pointerType === "touch" && !onHandle;
    const onMove = (ev: globalThis.PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      d.clientX = ev.clientX;
      d.clientY = ev.clientY;
      if (!d.started) {
        const moved = Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY);
        if (touchBody && moved > TOUCH_SLOP)
          end(false); // a swipe: let the page scroll
        else if (!touchBody && moved > MOUSE_SLOP) begin();
        return;
      }
      place();
      hitTest();
    };
    // Only a real release commits; a cancelled pointer (gesture arbitration, an interrupted touch) snaps back.
    const onUp = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId === drag.current?.pointerId) end(ev.type === "pointerup");
    };
    // Once a touch drag has started, keep the page from scrolling under the finger.
    const onTouchMove = (ev: TouchEvent) => {
      if (drag.current?.started && ev.cancelable) ev.preventDefault();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    drag.current = {
      id,
      pointerId: e.pointerId,
      started: false,
      startX: e.clientX,
      startY: e.clientY,
      clientX: e.clientX,
      clientY: e.clientY,
      grabX: 0,
      grabY: 0,
      homes: new Map(),
      lastSwap: null,
      timer: touchBody ? window.setTimeout(begin, HOLD_MS) : null,
      raf: null,
      cleanup: () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        window.removeEventListener("touchmove", onTouchMove);
      },
    };
    if (onHandle) {
      e.preventDefault();
      begin();
    }
  };

  /** The grip's keyboard reordering: arrows move by one, Home / End to either end. */
  const onHandleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, id: WidgetId) => {
    const i = layout.findIndex((w) => w.id === id);
    const to =
      e.key === "ArrowUp" || e.key === "ArrowLeft"
        ? i - 1
        : e.key === "ArrowDown" || e.key === "ArrowRight"
          ? i + 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? layout.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    if (to < 0 || to >= layout.length || to === i) return;
    capture();
    refocus.current = { id, control: "handle" };
    setLayout(moveWidget(layout, i, to));
    setAnnouncement(`${widgetDef(id).title} moved to position ${to + 1} of ${layout.length}.`);
  };

  const remove = (id: WidgetId) => {
    const i = layout.findIndex((w) => w.id === id);
    const next = layout[i + 1] ?? layout[i - 1];
    capture();
    refocus.current = next ? { id: next.id, control: "remove" } : "add";
    setLayout(removeWidget(layout, id));
    setAnnouncement(`${widgetDef(id).title} removed.`);
  };

  const resize = (id: WidgetId, size: WidgetSize) => {
    capture();
    setLayout(resizeWidget(layout, id, size));
    setAnnouncement(`${widgetDef(id).title} is now ${SIZE_NAME[size]}.`);
  };

  const add = (id: WidgetId) => {
    capture();
    added.current = id;
    setLayout(addWidget(layout, id));
    setAdding(false);
    setAnnouncement(`${widgetDef(id).title} added at the end.`);
  };

  const reset = () => {
    capture();
    setLayout(DEFAULT_LAYOUT);
    setAnnouncement("Overview reset to the default layout.");
  };

  // After any layout change: animate widgets from where they were (FLIP), re-anchor a lifted widget,
  // and put focus back where the action left it.
  useLayoutEffect(() => {
    const first = flipFrom.current;
    flipFrom.current = null;
    const d = drag.current;
    if (first) {
      for (const [id, el] of frames.current) {
        const from = first.get(id);
        if (!from || id === d?.id) continue;
        el.style.transition = "none";
        el.style.translate = "";
        const to = el.getBoundingClientRect();
        const dx = from.left - to.left;
        const dy = from.top - to.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        el.style.translate = `${dx}px ${dy}px`;
        el.getBoundingClientRect(); // commit the inverted position before transitioning out of it
        el.style.transition = `translate ${FLIP_MS}ms cubic-bezier(0.2, 0, 0, 1)`;
        el.style.translate = "";
      }
    }
    if (d?.started) {
      d.homes = measureHomes();
      place();
    }
    const f = refocus.current;
    refocus.current = null;
    if (f === "add") addRef.current?.focus();
    else if (f) frames.current.get(f.id)?.querySelector<HTMLElement>(`[data-widget-control="${f.control}"]`)?.focus();
  });

  // A transition left on an element would also animate the next drag's first move.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const clear = (e: TransitionEvent) => {
      const el = e.target as HTMLElement;
      if (e.propertyName === "translate" && el.parentElement === grid) el.style.transition = "";
    };
    grid.addEventListener("transitionend", clear);
    return () => grid.removeEventListener("transitionend", clear);
  });

  // Escape cancels a drag, then leaves edit mode (the Add widget dialog handles its own Escape).
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (drag.current?.started) end(false);
      else if (!adding) setEditing(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // Leaving edit mode (Done, the header button) drops any drag in progress.
  useEffect(() => {
    if (!editing && drag.current) end(false);
  });

  // The header Edit button hides while editing, so focus follows the mode: in to the edit bar, back out to
  // the button. Only when focus is on that button or has dropped to <body>; a dialog or a widget control keeps it.
  const wasEditing = useRef(editing);
  const doneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (wasEditing.current === editing) return;
    wasEditing.current = editing;
    const active = document.activeElement;
    const headerButton = headerEditButton();
    if (active && active !== document.body && active !== headerButton) return;
    if (editing) (addRef.current?.disabled ? doneRef.current : addRef.current)?.focus();
    else headerButton?.focus();
  }, [editing]);

  // Leaving the page leaves edit mode, so it doesn't greet the owner on the next visit.
  useEffect(() => () => setEditing(false), []);

  /** After adding, focus lands on the new widget's grip; it is scrolled into view once the dialog lets go of the page. */
  const finalFocus = () => {
    const id = added.current;
    added.current = null;
    const frame = id ? frames.current.get(id) : undefined;
    if (!frame) return true;
    window.setTimeout(() => frame.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" }), 50);
    return frame.querySelector<HTMLElement>('[data-widget-control="handle"]') ?? true;
  };

  return (
    <>
      {editing && (
        // Sticks below the phone top bar, or from md below the sticky page bar (48px, z-20); z-10 keeps it under that bar.
        <div className="sticky top-[calc(3rem+env(safe-area-inset-top))] z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card/95 px-3 py-2 ring-1 ring-foreground/10 supports-backdrop-filter:backdrop-blur-sm md:top-[calc(3rem+0.5rem)]">
          <p className="hidden text-[12.5px] text-muted-foreground sm:block">Drag to rearrange · arrow keys on a grip move it</p>
          {/* On phones the buttons fill the row (Add widget stretches, Reset is icon-only) so it stays one line at 320px. */}
          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <Button
              ref={addRef}
              variant="outline"
              size="sm"
              className="pointer-coarse:h-11 max-sm:flex-1"
              disabled={!hidden.length}
              title={hidden.length ? undefined : "Every widget is on the Overview"}
              onClick={() => setAdding(true)}
            >
              <PlusIcon /> Add widget
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="pointer-coarse:h-11 max-sm:w-9 max-sm:px-0 max-sm:pointer-coarse:w-11"
              disabled={sameLayout(layout, DEFAULT_LAYOUT)}
              onClick={reset}
              title="Reset to the default layout"
            >
              <RotateCcwIcon />
              <span className="max-sm:sr-only">Reset</span>
            </Button>
            <Button ref={doneRef} size="sm" className="pointer-coarse:h-11" onClick={() => setEditing(false)}>
              Done
            </Button>
          </div>
        </div>
      )}
      {layout.length ? (
        <div className={WIDGET_AREA}>
          <div ref={gridRef} className={cn(WIDGET_GRID, "relative")}>
            {layout.map(({ id, size }) => {
              const def = widgetDef(id);
              const { Component, fallback } = RENDER[id];
              const bigger = SIZE_RANK[nextSize(id, size)] > SIZE_RANK[size];
              return (
                // biome-ignore lint/a11y/noStaticElementInteractions: pointer dragging only; the grip button is the keyboard and screen-reader way to move a widget
                <div
                  key={id}
                  ref={frameRef(id)}
                  data-widget={id}
                  data-dragging={dragId === id ? "" : undefined}
                  className={cn(
                    "relative flex min-w-0 flex-col rounded-xl",
                    widgetSpan(def, size),
                    // A widget with nothing to show (no data yet) takes no slot and no gap.
                    "has-[>[data-widget-content]:empty]:hidden",
                    editing && "widget-wiggle cursor-grab touch-manipulation select-none [-webkit-touch-callout:none]",
                    dragId === id && "z-[5] scale-[1.02] cursor-grabbing shadow-[0_8px_28px_rgb(0_0_0/0.14)]",
                  )}
                  style={editing ? ({ "--wiggle": WIGGLE[size] } as CSSProperties) : undefined}
                  onPointerDown={editing ? (e) => onPointerDown(e, id) : undefined}
                  onContextMenu={editing ? (e) => e.preventDefault() : undefined}
                >
                  {/* While editing, the widget itself is inert: a drag never clicks a link or a chart mark. */}
                  <div data-widget-content className="flex flex-1 flex-col *:data-[slot=card]:flex-1" inert={editing}>
                    <Suspense fallback={fallback}>
                      <Component />
                    </Suspense>
                  </div>
                  {editing && (
                    <>
                      <button
                        type="button"
                        data-widget-control="handle"
                        aria-label={`Move ${def.title}`}
                        aria-describedby="widget-move-hint"
                        className={cn(
                          controlClass,
                          "-top-1.5 -left-1.5 cursor-grab touch-none bg-popover text-foreground ring-1 ring-foreground/15 pointer-coarse:after:-right-5 pointer-coarse:after:left-0",
                        )}
                        onKeyDown={(e) => onHandleKeyDown(e, id)}
                      >
                        <GripIcon className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        data-widget-control="remove"
                        aria-label={`Remove ${def.title}`}
                        className={cn(controlClass, "-top-1.5 -right-1.5 bg-[var(--text-secondary)] text-background")}
                        onClick={() => remove(id)}
                      >
                        <MinusIcon className="size-3.5" strokeWidth={3} />
                      </button>
                      {def.sizes.length > 1 && (
                        <button
                          type="button"
                          data-widget-control="resize"
                          aria-label={`Make ${def.title} ${SIZE_NAME[nextSize(id, size)]}`}
                          title={`Make ${SIZE_NAME[nextSize(id, size)]}`}
                          className={cn(
                            controlClass,
                            sizeToggleVisibility(def),
                            "-right-1.5 -bottom-1.5 bg-popover text-foreground ring-1 ring-foreground/15",
                          )}
                          onClick={() => resize(id, nextSize(id, size))}
                        >
                          {bigger ? <Maximize2Icon className="size-3" /> : <Minimize2Icon className="size-3" />}
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <LayoutGridIcon className="size-6 text-muted-foreground" aria-hidden />
            <div>
              <div className="font-medium">Nothing on your Overview</div>
              <p className="mt-1 text-sm text-muted-foreground">Add widgets to see your totals, renewals and charts here.</p>
            </div>
            <Button
              variant="outline"
              className="pointer-coarse:h-11"
              onClick={() => {
                setEditing(true);
                setAdding(true);
              }}
            >
              <PlusIcon /> Add widget
            </Button>
          </CardContent>
        </Card>
      )}
      <p id="widget-move-hint" className="sr-only">
        Use the arrow keys to move it.
      </p>
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent finalFocus={finalFocus}>
          <DialogHeader>
            <DialogTitle>Add a widget</DialogTitle>
            <DialogDescription>It goes at the end of the Overview; drag it wherever you like.</DialogDescription>
          </DialogHeader>
          {hidden.length ? (
            <ul className="-mx-2 flex flex-col">
              {hidden.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left outline-none hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
                    onClick={() => add(w.id)}
                  >
                    <PlusIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0">
                      <span className="block font-medium">{w.title}</span>
                      <span className="block text-[12.5px] text-muted-foreground">{w.description}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Every widget is already on your Overview.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * A 24px round badge on a widget's corner, poking 6px out. On touch its hit area grows to 44px, but
 * inward (toward the widget) and into the row gap, never sideways past the page's 16px gutter.
 */
const controlClass =
  "absolute z-10 grid size-6 place-items-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring pointer-coarse:after:absolute pointer-coarse:after:-inset-y-2.5 pointer-coarse:after:right-0 pointer-coarse:after:-left-5";
