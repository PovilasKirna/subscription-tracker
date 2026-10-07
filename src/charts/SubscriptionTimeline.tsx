"use client";

import {
  type ChartFocusStrategy,
  type ChartInteractionController,
  type ChartPoint,
  type ChartScene,
  defineChart,
  dot,
  link,
  tickX,
} from "@tanstack/charts";
import { crosshair } from "@tanstack/charts/crosshair";
import { Chart } from "@tanstack/charts/react/tooltip";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleOrdinal } from "@tanstack/charts/scales/ordinal";
import { scaleUtc } from "d3-scale";
import { type KeyboardEvent, useMemo, useRef } from "react";
import { TooltipNote, TooltipRow } from "./ChartTooltip";
import { fitLabel, isOther, marks, seriesColor, tokens } from "./palette";
import { axisLine, chartTheme, chartTooltip, focusRing, gridLine, tickLabels } from "./theme";
import { timelineRowLabel } from "./timelineLabel";
import type { TimelineCharge, TimelineRow, Today } from "./types";

type Props<T extends TimelineRow> = {
  data: readonly T[];
  today: Today;
  formatMoney: (amount: number, currency: string) => string;
  formatDate: (d: string) => string;
  formatTick: (d: Date) => string;
  /** Room each axis label needs, in px (default 90); short labels allow more ticks. */
  tickWidth?: number;
  /**
   * Optional window start (an ISO date). The axis then runs from here to today, only charges from it on
   * are drawn, and subscriptions that ended before it are left out. Without it the axis starts at the
   * earliest first charge.
   */
  from?: string;
  /**
   * Optional: called with a row's key on click, Enter or Space. When set, the rows say so in the
   * chart's description; without it the chart is read-only.
   */
  onSelect?: (key: string) => void;
};

/** Every mark's datum: the row plus the charge it stands for (the span stands for the latest one). */
type Hover<T extends TimelineRow> = { row: T; charge: TimelineCharge; change?: T["priceChanges"][number] };
type Point = ChartPoint<Hover<TimelineRow>, Date, string>;

const ROW = 30;
const TOP = 6;
const AXIS = 28;
const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
/** Faded rows dim their marks only; the label keeps text contrast. */
const fade = (paint: string) => `color-mix(in oklab, ${paint} 45%, transparent)`;

/**
 * Pointer: the row under the pointer, then its charge nearest in time. Only charge ticks are
 * focus targets (the span and price-change marks share their row's datum but are paint only).
 */
function rowThenCharge(): ChartFocusStrategy<Hover<TimelineRow>, Date, string> {
  const charges = (points: readonly Point[]) => points.filter((p) => p.markId === "charges");
  return {
    resolve: (points, { x, y }) => {
      let best: Point | undefined;
      for (const p of charges(points)) {
        if (!best) best = p;
        else {
          const dy = Math.abs(p.y - y) - Math.abs(best.y - y);
          if (dy < -0.5 || (Math.abs(dy) <= 0.5 && Math.abs(p.x - x) < Math.abs(best.x - x))) best = p;
        }
      }
      return best ? [best] : [];
    },
    group: (_points, { point }) => [point],
    navigation: charges,
  };
}

/** One row per subscription: a span from first to last charge, a tick per charge, a ringed marker per price change. */
export function SubscriptionTimeline<T extends TimelineRow>({
  data,
  today,
  formatMoney,
  formatDate,
  formatTick,
  tickWidth = 90,
  from,
  onSelect,
}: Props<T>) {
  const rows = useMemo(() => (from ? data.filter((r) => r.lastCharge >= from) : data), [data, from]);

  // Keyboard: the chart is one tab stop. Up / Down move between rows (Ctrl+Home / Ctrl+End to the
  // first / last), Left / Right (and Home / End) step through the focused row's charges. The chart's
  // own keyboard handling is off; these keys drive its focus through the interaction controller.
  const host = useRef<{
    interaction: ChartInteractionController<Hover<TimelineRow>, Date, string>;
    scene: ChartScene<Hover<TimelineRow>, Date, string>;
  }>(null);
  const cursor = useRef<{ row: number; charge: number } | null>(null);
  // What the tooltip's status region says: the whole row on landing, the charge while stepping.
  const announce = useRef<"row" | "charge">("row");

  const definition = useMemo(() => {
    // The marks inside the window; tooltips and Left / Right stepping only visit these.
    const shown = rows.map((row) => ({
      row,
      charges: from ? row.charges.filter((c) => c.date >= from) : row.charges,
      changes: from ? row.priceChanges.filter((pc) => pc.date >= from) : row.priceChanges,
    }));
    const hover = (row: TimelineRow, charge: TimelineCharge): Hover<TimelineRow> => ({
      row,
      charge,
      change: row.priceChanges.find((pc) => pc.date === charge.date),
    });
    const ticks = shown.flatMap((s) => s.charges.map((c) => hover(s.row, c)));
    const spans = shown.flatMap((s) => {
      const latest = s.charges.at(-1);
      return latest ? [hover(s.row, latest)] : [];
    });
    const changes: Hover<TimelineRow>[] = shown.flatMap((s) =>
      s.changes.flatMap((pc) => {
        const charge = s.charges.find((c) => c.date === pc.date);
        return charge ? [{ row: s.row, charge, change: pc }] : [];
      }),
    );
    const others = (list: Hover<TimelineRow>[]) => list.filter((h) => isOther(h.row.color));
    const faded = (row: TimelineRow) => row.status === "inactive" || row.status === "cancelled";
    const paintOf = (row: TimelineRow) => (faded(row) ? fade(seriesColor(row.color)) : seriesColor(row.color));
    const paint = (h: Hover<TimelineRow>) => paintOf(h.row);
    // A span that began before the window starts at the axis.
    const spanStart = (h: Hover<TimelineRow>) => toDate(from && h.row.firstCharge < from ? from : h.row.firstCharge);
    const nameOf = new Map(rows.map((r) => [r.key, r.name]));
    const fadedKeys = new Set(rows.filter(faded).map((r) => r.key));
    const first = from ?? rows.reduce((min, r) => (r.firstCharge < min ? r.firstCharge : min), today);
    const spanEnd = (h: Hover<TimelineRow>) => toDate(h.row.lastCharge);
    const rowKey = (h: Hover<TimelineRow>) => h.row.key;
    const at = (h: Hover<TimelineRow>) => toDate(h.charge.date);

    return defineChart(
      ({ width }) => ({
        marks: [
          // Hover / keyboard row band, behind the marks.
          crosshair({ x: false, y: { band: { radius: 6, fill: tokens.grid, fillOpacity: 0.45 } } }),
          // "Other" grey alone gets a 1px graphite edge: a wider graphite line underneath.
          link(others(spans), {
            id: "other-span",
            x1: spanStart,
            x2: spanEnd,
            y1: rowKey,
            y2: rowKey,
            stroke: tokens.textSecondary,
            strokeWidth: marks.line + 2,
          }),
          tickX(others(ticks), {
            id: "other-ticks",
            x: at,
            y: rowKey,
            length: 10,
            stroke: tokens.textSecondary,
            strokeWidth: marks.line + 2,
          }),
          link(spans, {
            id: "spans",
            x1: spanStart,
            x2: spanEnd,
            y1: rowKey,
            y2: rowKey,
            stroke: paint,
            strokeWidth: marks.line,
          }),
          tickX(ticks, {
            id: "charges",
            x: at,
            y: rowKey,
            key: (h) => `${h.row.key}-${h.charge.date}`,
            length: 10,
            stroke: paint,
            strokeWidth: marks.line,
          }),
          // Dots take their row's paint through the colour scale below; "Other" dots get the
          // graphite outline instead of the surface ring.
          dot(
            changes.filter((h) => !isOther(h.row.color)),
            { id: "price-changes", x: at, y: rowKey, color: rowKey, r: marks.markerR + 1, stroke: tokens.surface, strokeWidth: marks.ring },
          ),
          dot(others(changes), {
            id: "other-price-changes",
            x: at,
            y: rowKey,
            color: rowKey,
            r: marks.markerR + 1,
            stroke: tokens.textSecondary,
            strokeWidth: 1,
          }),
        ],
        color: {
          scale: scaleOrdinal(
            rows.map((r) => r.key),
            rows.map((r) => paintOf(r)),
          ),
        },
        scales: {
          x: {
            scale: scaleUtc().domain([toDate(first), toDate(today)]),
            grid: gridLine,
            axis: { line: axisLine, ticks: { spacing: tickWidth, size: 0, format: formatTick }, tickLabels },
          },
          y: {
            // Rows keep the data order (not the order marks first mention them in).
            scale: scaleBand<string>()
              .domain(rows.map((r) => r.key))
              .padding(0),
            axis: {
              line: false,
              ticks: { size: 0, padding: 12, format: (key: string) => fitLabel(nameOf.get(key) ?? key, width < 520 ? 13 : 20) },
              tickLabels: { ...tickLabels, thin: false, opacity: ({ value }: { value: string }) => (fadedKeys.has(value) ? 0.7 : 1) },
            },
          },
        },
        margin: { top: TOP, right: 30 }, // right: room for the last tick label
      }),
      {
        theme: chartTheme,
        focusRing,
        focus: rowThenCharge(),
        maxFocusDistance: Number.POSITIVE_INFINITY,
        keyboard: false,
        tooltip: {
          ...chartTooltip,
          // What the polite status region announces: everything the row shows on landing, then the
          // charge each Left / Right step lands on.
          format: ({ datum: h }: { datum: Hover<TimelineRow> }) =>
            announce.current === "row"
              ? timelineRowLabel(h.row, { money: formatMoney, date: formatDate }, from)
              : `${formatDate(h.charge.date)}: ${formatMoney(h.charge.amount, h.row.currency)}${
                  h.change
                    ? `, price change ${formatMoney(h.change.from, h.row.currency)} to ${formatMoney(h.change.to, h.row.currency)}`
                    : ""
                }`,
        },
      },
    );
  }, [rows, today, from, tickWidth, formatTick, formatMoney, formatDate]);

  const chargesOf = (row: T) => (from ? row.charges.filter((c) => c.date >= from) : row.charges);
  const focusCharge = (rowIndex: number, chargeIndex: number) => {
    const row = rows[Math.min(Math.max(rowIndex, 0), rows.length - 1)];
    const charges = row ? chargesOf(row) : [];
    const charge = charges[Math.min(Math.max(chargeIndex, 0), charges.length - 1)];
    if (!row || !charge || !host.current) return;
    cursor.current = { row: rows.indexOf(row), charge: charges.indexOf(charge) };
    const point = host.current.scene.points.find(
      (p) => p.markId === "charges" && p.datum.row.key === row.key && p.datum.charge.date === charge.date,
    );
    host.current.interaction.setControlledFocus(point ?? null, { source: "programmatic" });
  };
  const clearFocus = () => {
    cursor.current = null;
    host.current?.interaction.setControlledFocus(null);
  };
  const landOnRow = (i: number) => {
    announce.current = "row";
    const row = rows[Math.min(Math.max(i, 0), rows.length - 1)];
    if (row) focusCharge(rows.indexOf(row), chargesOf(row).length - 1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = cursor.current ?? { row: 0, charge: 0 };
    const row = rows[at.row];
    if (e.key === "Escape") return clearFocus();
    if (onSelect && row && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      return onSelect(row.key);
    }
    let handled = true;
    if ((e.ctrlKey || e.metaKey) && (e.key === "Home" || e.key === "End")) landOnRow(e.key === "Home" ? 0 : rows.length - 1);
    else if (e.key === "ArrowUp") landOnRow(at.row - 1);
    else if (e.key === "ArrowDown") landOnRow(at.row + 1);
    else if (row && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
      announce.current = "charge";
      const last = chargesOf(row).length - 1;
      focusCharge(at.row, e.key === "ArrowLeft" ? at.charge - 1 : e.key === "ArrowRight" ? at.charge + 1 : e.key === "Home" ? 0 : last);
    } else handled = false;
    if (handled) e.preventDefault();
  };

  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">No charges in this period.</p>;

  return (
    // biome-ignore lint/a11y/useSemanticElements: a <fieldset> would add a form group; this names one keyboard-driven chart
    <div
      role="group"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the chart is one tab stop; its arrow keys move between rows and charges
      tabIndex={0}
      aria-label={`Subscription timeline. Up and down arrows move between subscriptions; left and right arrows step through charges.${
        onSelect ? " Enter opens the subscription." : ""
      }`}
      className="chart-focus rounded-md"
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        if (e.target === e.currentTarget && !cursor.current) landOnRow(0);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) clearFocus();
      }}
    >
      <Chart
        definition={definition}
        height={TOP + AXIS + rows.length * ROW}
        initialWidth={560}
        ariaLabel="Subscription timeline"
        style={onSelect ? { cursor: "pointer" } : undefined}
        onRender={({ interaction, scene }) => {
          host.current = { interaction, scene };
        }}
        onFocusChange={() => {
          // Pointer hover: the tooltip should read the charge under the pointer.
          if (!cursor.current) announce.current = "charge";
        }}
        onSelect={(point) => {
          if (point && onSelect) onSelect(point.datum.row.key);
        }}
        renderTooltipBody={({ points }) => {
          const h = points[0]?.datum;
          if (!h) return null;
          return (
            <>
              <TooltipRow color={h.row.color} label={h.row.name} value="" strong />
              <TooltipRow label={formatDate(h.charge.date)} value={formatMoney(h.charge.amount, h.row.currency)} />
              {h.change && (
                <TooltipRow
                  label="Price change"
                  value={`${formatMoney(h.change.from, h.row.currency)} → ${formatMoney(h.change.to, h.row.currency)}`}
                />
              )}
              <TooltipNote>
                {h.row.charges.length} charges · since {formatDate(h.row.firstCharge)}
              </TooltipNote>
            </>
          );
        }}
      />
    </div>
  );
}
