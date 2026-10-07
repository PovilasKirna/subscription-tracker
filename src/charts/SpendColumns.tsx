"use client";

import { barY, defineChart, text } from "@tanstack/charts";
import { crosshair } from "@tanstack/charts/crosshair";
import { Chart } from "@tanstack/charts/react/tooltip";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { useMemo } from "react";
import { TooltipDivider, TooltipRow } from "./ChartTooltip";
import { Legend } from "./Legend";
import { isOther, MIN_TEXT, marks, seriesColor, tokens } from "./palette";
import { axisLine, chartTheme, chartTooltip, focusRing, gridLine, tickLabels } from "./theme";
import type { Month, MonthlySpend, SeriesMeta } from "./types";

type Props<K extends string> = {
  data: MonthlySpend<K>[];
  keys: readonly K[];
  series: readonly SeriesMeta<K>[];
  formatValue: (n: number) => string;
  formatAxisValue: (n: number) => string;
  formatMonth: (m: Month) => string;
  formatMonthLong: (m: Month) => string;
  /** Total height including the x-axis band. */
  height?: number;
  /** Grow past `height` to fill a flex parent (the card stretched by a taller neighbour). */
  fill?: boolean;
};

/** One stack segment: a month and one series' slice of its column, in spend (wide month rows, made long). */
type Segment<K extends string> = { month: Month; key: K; y1: number; y2: number; top: boolean; row: MonthlySpend<K> };

/** Locked top and bottom margins (room for the direct label and the month axis) keep the plot height exact. */
const MARGIN = { top: 20, bottom: 28 } as const;

/** Monthly recurring spend, stacked by subscription ("Other" folds everything past slot 7). */
export function SpendColumns<K extends string>({
  data,
  keys,
  series,
  formatValue,
  formatAxisValue,
  formatMonth,
  formatMonthLong,
  height = 300,
  fill,
}: Props<K>) {
  /** The month total, then every contributor largest first: everything the tooltip shows. */
  const monthLabel = useMemo(
    () => (d: MonthlySpend<K>) => {
      const parts = series
        .filter((s) => d[s.key] > 0)
        .sort((a, b) => d[b.key] - d[a.key])
        .map((s) => `${s.name} ${formatValue(d[s.key])}`);
      return `${formatMonthLong(d.month)}: ${formatValue(d.total)}${parts.length ? ` — ${parts.join(", ")}` : ""}`;
    },
    [series, formatValue, formatMonthLong],
  );

  const definition = useMemo(() => {
    const colorOf = new Map(series.map((s) => [s.key, s.color]));
    const last = data.at(-1);
    // The y domain is niced here (not by the chart) so a pixel gap can be converted to spend below.
    const yMax = scaleLinear()
      .domain([0, Math.max(1, ...data.map((d) => d.total))])
      .nice(4)
      .domain()[1];
    return defineChart(
      ({ height }) => {
        // 2px surface gap between stacked segments, as spend: the plot height is exact because the
        // top and bottom margins are locked below.
        const gap = (marks.gap * yMax) / Math.max(1, height - MARGIN.top - MARGIN.bottom);
        // Stacked bottom → top in `keys` order; empty segments are left out, and only the top
        // non-empty segment of each column carries the 4px rounded data-end.
        const segments: Segment<K>[] = data.flatMap((row) => {
          const present = keys.filter((key) => row[key] > 0);
          let base = 0;
          return present.map((key, i) => {
            const top = i === present.length - 1;
            const seg = { month: row.month, key, y1: base, y2: Math.max(base, base + row[key] - (top ? 0 : gap)), top, row };
            base += row[key];
            return seg;
          });
        });
        return {
          marks: [
            // Hover / keyboard band behind the marks so it never washes them out.
            crosshair({ x: { band: { radius: 6, inset: -4, fill: tokens.grid, fillOpacity: 0.45 } }, y: false }),
            barY(segments, {
              x: "month",
              y1: "y1",
              y2: "y2",
              key: (s) => `${s.key}-${s.month}`,
              fill: (s) => seriesColor(colorOf.get(s.key) ?? null),
              // "Other" alone gets a 1px graphite outline, which lifts its grey off the card.
              stroke: (s) => (isOther(colorOf.get(s.key)) ? tokens.textSecondary : "none"),
              strokeWidth: 1,
              maxThickness: marks.maxBar,
              radius: (s) => (s.top ? [marks.radius, marks.radius, 0, 0] : 0),
            }),
            // Direct label: only the latest month's total.
            text(last && last.total > 0 ? [{ month: last.month, total: last.total, row: last }] : [], {
              x: "month",
              y: "total",
              text: (d) => formatAxisValue(d.total),
              dy: -10,
              fontSize: MIN_TEXT,
              fontWeight: 600,
              fill: tokens.textPrimary,
            }),
          ],
          scales: {
            x: {
              scale: () => scaleBand<Month>().padding(0.25),
              axis: {
                line: axisLine,
                ticks: { size: 0, format: formatMonth },
                // Thin month labels when columns get narrow so they never collide; keep the latest.
                tickLabels: { ...tickLabels, thin: { minGap: 10, keep: last ? [last.month] : [] } },
              },
            },
            y: {
              scale: scaleLinear().domain([0, yMax]),
              grid: gridLine,
              axis: { line: false, ticks: { count: 4, size: 0, format: formatAxisValue }, tickLabels },
            },
          },
          margin: MARGIN,
        };
      },
      {
        theme: chartTheme,
        focusRing,
        // One stop per month: the whole column band picks it, and the arrow keys step through months.
        focus: "group-x",
        maxFocusDistance: Number.POSITIVE_INFINITY,
        tooltip: {
          ...chartTooltip,
          // What the polite status region announces for keyboard users.
          formatGroup: (points) => {
            const row = points[0]?.datum.row;
            return row ? monthLabel(row) : "";
          },
        },
      },
    );
  }, [data, keys, series, formatAxisValue, formatMonth, monthLabel]);

  return (
    <div className={fill ? "flex flex-1 flex-col" : undefined}>
      <Legend items={series.map((s) => ({ key: s.key, label: s.name, color: s.color }))} />
      <Chart
        definition={definition}
        height={fill ? undefined : height}
        initialWidth={560}
        style={fill ? { flex: 1, minHeight: height } : undefined}
        ariaLabel="Monthly subscription spend, stacked by subscription"
        ariaDescription="Use the arrow keys to move between months."
        renderTooltipBody={({ points }) => {
          const row = points[0]?.datum.row;
          if (!row) return null;
          return (
            <>
              <TooltipRow label={formatMonthLong(row.month)} value={formatValue(row.total)} strong />
              <TooltipDivider />
              {[...series]
                .reverse()
                .filter((s) => row[s.key] > 0)
                .map((s) => (
                  <TooltipRow key={s.key} color={s.color} label={s.name} value={formatValue(row[s.key])} />
                ))}
            </>
          );
        }}
      />
    </div>
  );
}
