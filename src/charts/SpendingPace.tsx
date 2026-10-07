"use client";

import { areaY, defineChart, dot, lineY } from "@tanstack/charts";
import { crosshair } from "@tanstack/charts/crosshair";
import { whenFocused } from "@tanstack/charts/focus/mark";
import { Chart } from "@tanstack/charts/react/tooltip";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { useMemo } from "react";
import { TooltipDivider, TooltipRow } from "./ChartTooltip";
import { enterNearEnd } from "./keyboardEntry";
import { MIN_TEXT, marks, seriesColor, tokens } from "./palette";
import { axisLine, chartTheme, chartTooltip, focusRing, gridLine, indexTicks, inkRing, tickLabels } from "./theme";
import type { SpendingPacePoint } from "./types";

/** Locked margins: the right one holds the end pills, and top / bottom keep the plot height exact for them. */
const MARGIN = { top: 16, right: 64, bottom: 28 } as const;
const PILL_W = MARGIN.right - 10;
const NEUTRAL = seriesColor(1);
const PREVIOUS = "var(--series-other)";
const PROJECTED = "var(--text-muted)";
/** This period ahead of the last one (spent more) is red; behind it (spent less) is green. */
const MORE = "var(--delta-bad)";
const LESS = "var(--delta-good)";

type Props = {
  /** Every point of the period; `spent` stops at today, `projected` carries on to the end. */
  data: SpendingPacePoint[];
  /** e.g. "October" / "September", for the tooltip. */
  label: string;
  previousLabel: string;
  formatValue: (n: number) => string;
  formatAxisValue: (n: number) => string;
  /** Pills on the right edge, e.g. the projected month-end and last month's total. */
  endLabels?: { value: number; muted?: boolean }[];
  height?: number;
};

/** A point with its index: x is the point's position, so days, weekdays and months share one chart. */
type Row = SpendingPacePoint & { i: number };

/**
 * Red if this period is ahead of the last one at its latest point (today, or the period's end), green
 * if behind; blue when there's nothing to compare. One colour for the whole line: a day or two of
 * being ahead mid-month doesn't matter, only where you stand now.
 */
function standing(points: SpendingPacePoint[]): string {
  const latest = points.filter((p) => p.spent !== null && p.previous !== null).at(-1);
  if (!latest) return NEUTRAL;
  return (latest.spent ?? 0) > (latest.previous ?? 0) ? MORE : LESS;
}

/**
 * Spending so far in a period against the period before, Revolut-style: the line and the area under
 * it (fading out downwards) are green if you're behind last period's pace today, red if ahead. The
 * tooltip gives the difference, so colour never carries the meaning alone.
 */
export function SpendingPace({ data, label, previousLabel, formatValue, formatAxisValue, endLabels = [], height = 260 }: Props) {
  // The y domain is niced here so the HTML end pills can be placed on the same scale. Refunds before
  // any purchases can take a running total below zero; keep those points in view.
  const [yMin, yMax] = useMemo(() => {
    const values = [...data.flatMap((d) => [d.spent ?? 0, d.previous ?? 0, d.projected ?? 0]), ...endLabels.map((l) => l.value)];
    const [lo = 0, hi = 1] = scaleLinear()
      .domain([Math.min(0, ...values), Math.max(1, ...values)])
      .nice(4)
      .domain();
    return [lo, hi];
  }, [data, endLabels]);
  // Tab lands on today (the latest actual spend), counted back from the period's last point.
  const today = data.findLastIndex((d) => d.spent !== null);
  const afterToday = data.slice(today + 1).filter((d) => d.spent !== null || d.previous !== null || d.projected !== null).length;

  const definition = useMemo(() => {
    const rows: Row[] = data.map((d, i) => ({ ...d, i }));
    const spent = rows.filter((d) => d.spent !== null);
    const color = standing(data);
    const last = data.length - 1;
    return defineChart({
      marks: [
        crosshair({ x: { stroke: tokens.axis, strokeOpacity: 1 }, y: false }),
        // The area between the line and zero fades out downwards.
        areaY(spent, { x: "i", y1: 0, y2: "spent", fill: "url(#fade)" }),
        lineY(
          rows.filter((d) => d.previous !== null),
          { x: "i", y: "previous", stroke: PREVIOUS, strokeWidth: marks.line },
        ),
        lineY(
          rows.filter((d) => d.projected !== null),
          { x: "i", y: "projected", stroke: PROJECTED, strokeWidth: marks.line, strokeDasharray: "4 4" },
        ),
        lineY(spent, { x: "i", y: "spent", stroke: color, strokeWidth: marks.line }),
        // Today.
        dot(spent.slice(-1), { x: "i", y: "spent", r: marks.markerR, fill: color, stroke: tokens.surface, strokeWidth: marks.ring }),
        // The ink focus ring on the focused point's leading line: spent, else projected, else previous.
        whenFocused(
          dot(
            rows.filter((d) => d.spent !== null || d.projected !== null || d.previous !== null),
            { x: "i", y: (d) => d.spent ?? d.projected ?? d.previous, ...inkRing },
          ),
          { match: "x" },
        ),
      ],
      gradients: [
        {
          id: "fade",
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 1,
          stops: [
            { offset: 0, color, opacity: 0.34 },
            { offset: 1, color, opacity: 0 },
          ],
        },
      ],
      scales: {
        x: {
          scale: scaleLinear().domain([0, Math.max(1, last)]),
          axis: {
            line: axisLine,
            ticks: { values: indexTicks(data.length), size: 0, format: (i: number) => data[i]?.label ?? "" },
            tickLabels,
          },
        },
        y: {
          scale: scaleLinear().domain([yMin, yMax]),
          grid: gridLine,
          axis: { line: false, ticks: { count: 4, size: 0, format: formatAxisValue }, tickLabels },
        },
      },
      margin: MARGIN,
      theme: chartTheme,
      focusRing,
      // The crosshair finds the point: anywhere on the plot picks the nearest one; arrow keys step.
      focus: "group-x",
      maxFocusDistance: Number.POSITIVE_INFINITY,
      tooltip: { ...chartTooltip, formatGroup: (points) => (points[0] ? paceLabel(points[0].datum) : "") },
    });

    /** Everything the tooltip shows, for the status region keyboard users hear. */
    function paceLabel(d: Row) {
      const now = d.spent ?? d.projected;
      return [
        d.title,
        d.spent !== null ? `${label} ${formatValue(d.spent)}` : d.projected !== null && `projected ${formatValue(d.projected)}`,
        d.previous !== null && `${previousLabel} ${formatValue(d.previous)}`,
        d.previous !== null && now !== null && `difference ${signed(now - d.previous, formatValue)}`,
      ]
        .filter(Boolean)
        .join(", ");
    }
  }, [data, yMin, yMax, label, previousLabel, formatValue, formatAxisValue]);

  // Right-edge pills, nudged apart when they'd overlap; HTML over the chart's locked right margin.
  const plotH = Math.max(0, height - MARGIN.top - MARGIN.bottom);
  const pills: { value: number; muted?: boolean; y: number }[] = [];
  for (const l of [...endLabels].sort((a, b) => b.value - a.value)) {
    const y = MARGIN.top + (plotH * (yMax - l.value)) / (yMax - yMin);
    const prev = pills.at(-1);
    pills.push({ ...l, y: prev && y - prev.y < 20 ? prev.y + 20 : y });
  }

  return (
    <div className="relative">
      <Chart
        definition={definition}
        height={height}
        initialWidth={560}
        onRender={enterNearEnd(afterToday)}
        ariaLabel={`${label} spending`}
        ariaDescription="Use the arrow keys to read each point."
        renderTooltipBody={({ points }) => {
          const d = points[0]?.datum;
          if (!d) return null;
          const now = d.spent ?? d.projected;
          return (
            <>
              <TooltipRow label={d.title} value="" strong />
              <TooltipDivider />
              {d.spent !== null && <TooltipRow label={label} value={formatValue(d.spent)} />}
              {d.spent === null && d.projected !== null && <TooltipRow label="Projected" value={formatValue(d.projected)} />}
              {d.previous !== null && <TooltipRow color={null} label={previousLabel} value={formatValue(d.previous)} />}
              {d.previous !== null && now !== null && (
                <>
                  <TooltipDivider />
                  <TooltipRow label="Difference" value={<Difference value={now - d.previous} format={formatValue} />} />
                </>
              )}
            </>
          );
        }}
      />
      {pills.map((p) => (
        <div
          key={`${p.value}-${p.muted}`}
          aria-hidden
          className="tabular pointer-events-none absolute flex h-5 items-center justify-center rounded-md bg-[var(--grid)] font-semibold"
          style={{
            top: p.y - 10,
            right: MARGIN.right - 8 - PILL_W,
            width: PILL_W,
            fontSize: MIN_TEXT,
            color: p.muted ? tokens.textMuted : tokens.textPrimary,
          }}
        >
          {formatAxisValue(p.value)}
        </div>
      ))}
    </div>
  );
}

/** A difference as text with its sign: "+€12.00", "−€3.50", "±€0.00". */
export function signed(value: number, format: (n: number) => string) {
  return `${value > 0.005 ? "+" : value < -0.005 ? "−" : "±"}${format(Math.abs(value))}`;
}

/** This period minus the last one at the same point: signed, red when more was spent, green when less. */
export function Difference({ value, format }: { value: number; format: (n: number) => string }) {
  const more = value > 0.005;
  const less = value < -0.005;
  return <span style={{ color: more ? MORE : less ? LESS : undefined }}>{signed(value, format)}</span>;
}
