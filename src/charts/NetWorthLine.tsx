"use client";

import { defineChart, dot, lineY, text } from "@tanstack/charts";
import { crosshair } from "@tanstack/charts/crosshair";
import { whenFocused } from "@tanstack/charts/focus/mark";
import { Chart } from "@tanstack/charts/react/tooltip";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scaleUtc } from "d3-scale";
import { useMemo } from "react";
import { TooltipDivider, TooltipRow } from "./ChartTooltip";
import { enterNearEnd } from "./keyboardEntry";
import { MIN_TEXT, marks, seriesColor, tokens } from "./palette";
import { axisLine, chartTheme, chartTooltip, focusRing, gridLine, inkRing, tickLabels } from "./theme";
import type { NetWorthDay } from "./types";

const LINE = seriesColor(1);

type Props = {
  data: NetWorthDay[];
  formatValue: (n: number) => string;
  formatAxisValue: (n: number) => string;
  /** Short tick label, e.g. "12 Oct". */
  formatDate: (date: string) => string;
  formatDateLong: (date: string) => string;
  /** Show the bank / investments split in the tooltip (only when both exist). */
  split: boolean;
  height?: number;
};

const toTime = (date: string) => new Date(`${date}T00:00:00Z`);

/** Net worth over time: one line (the total), crosshair + tooltip with the split, end value labelled. */
export function NetWorthLine({ data, formatValue, formatAxisValue, formatDate, formatDateLong, split, height = 280 }: Props) {
  const definition = useMemo(() => {
    const last = data.slice(-1);
    // Net worth rarely moves by its whole size, so the axis hugs the data (a line, not an area, so
    // the non-zero baseline doesn't exaggerate anything).
    const values = data.map((d) => d.total);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max((hi - lo) * 0.15, Math.abs(hi) * 0.02, 1);
    const at = (d: NetWorthDay) => toTime(d.date);
    const marker = { x: at, y: "total", r: marks.markerR, fill: LINE, stroke: tokens.surface, strokeWidth: marks.ring } as const;
    return defineChart({
      marks: [
        crosshair({ x: { stroke: tokens.axis, strokeOpacity: 1 }, y: false }),
        lineY(data, { x: at, y: "total", stroke: LINE, strokeWidth: marks.line }),
        // End dot + direct label: today's value.
        dot(last, marker),
        // The focused day gets the same dot, inside the ink focus ring.
        whenFocused(dot(data, marker), { match: "x" }),
        whenFocused(dot(data, { x: at, y: "total", ...inkRing }), { match: "x" }),
        text(last, {
          x: at,
          y: "total",
          text: (d) => formatAxisValue(d.total),
          anchor: "end",
          dy: -10,
          fontSize: MIN_TEXT,
          fontWeight: 600,
          fill: tokens.textPrimary,
        }),
      ],
      scales: {
        x: {
          scale: scaleUtc().domain([toTime(data[0].date), toTime(data[data.length - 1].date)]),
          axis: {
            line: axisLine,
            ticks: { spacing: 90, size: 0, format: (d: Date) => formatDate(d.toISOString().slice(0, 10)) },
            tickLabels,
          },
        },
        y: {
          scale: scaleLinear().domain([lo - pad, hi + pad]),
          nice: true,
          grid: gridLine,
          axis: { line: false, ticks: { count: 4, size: 0, format: formatAxisValue }, tickLabels },
        },
      },
      margin: { top: 24, right: 16 },
      theme: chartTheme,
      focusRing,
      // The crosshair finds the date: anywhere on the plot picks the nearest day; arrow keys step days.
      focus: "group-x",
      maxFocusDistance: Number.POSITIVE_INFINITY,
      tooltip: {
        ...chartTooltip,
        formatGroup: (points) => {
          const d = points[0]?.datum;
          if (!d) return "";
          const parts = split ? `, bank accounts ${formatValue(d.bank)}, investments ${formatValue(d.broker)}` : "";
          return `${formatDateLong(d.date)}: ${formatValue(d.total)}${parts}`;
        },
      },
    });
  }, [data, split, formatValue, formatAxisValue, formatDate, formatDateLong]);

  const first = data[0];
  const latest = data.at(-1);
  return (
    <Chart
      definition={definition}
      height={height}
      initialWidth={560}
      onRender={enterNearEnd()}
      ariaLabel="Net worth over time"
      ariaDescription={
        first && latest
          ? `From ${formatDateLong(first.date)} to ${formatDateLong(latest.date)}. Use the arrow keys to read each day.`
          : undefined
      }
      renderTooltipBody={({ points }) => {
        const d = points[0]?.datum;
        if (!d) return null;
        return (
          <>
            <TooltipRow label={formatDateLong(d.date)} value={formatValue(d.total)} strong />
            {split && (
              <>
                <TooltipDivider />
                <TooltipRow label="Bank accounts" value={formatValue(d.bank)} />
                <TooltipRow label="Investments" value={formatValue(d.broker)} />
              </>
            )}
          </>
        );
      }}
    />
  );
}
