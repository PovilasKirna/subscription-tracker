"use client";

import { defineChart, dot, lineY } from "@tanstack/charts";
import { crosshair } from "@tanstack/charts/crosshair";
import { whenFocused } from "@tanstack/charts/focus/mark";
import { Chart } from "@tanstack/charts/react/tooltip";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scaleUtc } from "d3-scale";
import { useMemo } from "react";
import { TooltipDivider, TooltipRow } from "./ChartTooltip";
import { enterNearEnd } from "./keyboardEntry";
import { marks, seriesColor, tokens } from "./palette";
import { axisLine, chartTheme, chartTooltip, focusRing, gridLine, inkRing, tickLabels } from "./theme";
import type { InvestmentDay } from "./types";

const VALUE = seriesColor(1);
const DEPOSITS = "var(--series-other)";

type Props = {
  data: InvestmentDay[];
  formatValue: (n: number) => string;
  formatAxisValue: (n: number) => string;
  formatDate: (date: string) => string;
  formatDateLong: (date: string) => string;
  height?: number;
};

const toTime = (date: string) => new Date(`${date}T00:00:00Z`);

/** Account value (solid) against the money paid in so far (dashed): the gap between them is the return. */
export function InvestmentLine({ data, formatValue, formatAxisValue, formatDate, formatDateLong, height = 280 }: Props) {
  const hasDeposits = data.some((d) => d.deposits !== null);

  const definition = useMemo(() => {
    const valueDays = data.filter((d) => d.value !== null);
    // Two lines (no area), so the axis can hug the data without exaggerating anything.
    const values = data.flatMap((d) => [d.value, d.deposits]).filter((v): v is number => v !== null);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max((hi - lo) * 0.12, Math.abs(hi) * 0.02, 1);
    const at = (d: InvestmentDay) => toTime(d.date);
    const valueDot = { x: at, y: "value", r: marks.markerR, fill: VALUE, stroke: tokens.surface, strokeWidth: marks.ring } as const;
    return defineChart({
      marks: [
        crosshair({ x: { stroke: tokens.axis, strokeOpacity: 1 }, y: false }),
        lineY(
          data.filter((d) => d.deposits !== null),
          { x: at, y: "deposits", stroke: DEPOSITS, strokeWidth: marks.line, strokeDasharray: "4 4" },
        ),
        lineY(valueDays, { x: at, y: "value", stroke: VALUE, strokeWidth: marks.line }),
        dot(valueDays.slice(-1), valueDot),
        // The focused day's dot sits on the value line, whichever line the pointer is nearer.
        whenFocused(dot(valueDays, valueDot), { match: "x" }),
        // The ink focus ring sits on the value line, or on net deposits on days before tracking began.
        whenFocused(
          dot(
            data.filter((d) => d.value !== null || d.deposits !== null),
            { x: at, y: (d) => d.value ?? d.deposits, ...inkRing },
          ),
          { match: "x" },
        ),
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
          // Negative net deposits (more withdrawn than paid in) stay in view.
          scale: scaleLinear().domain([lo < 0 ? lo - pad : Math.max(0, lo - pad), hi + pad]),
          nice: true,
          grid: gridLine,
          axis: { line: false, ticks: { count: 4, size: 0, format: formatAxisValue }, tickLabels },
        },
      },
      margin: { top: 20, right: 16 },
      theme: chartTheme,
      focusRing,
      focus: "group-x",
      maxFocusDistance: Number.POSITIVE_INFINITY,
      tooltip: {
        ...chartTooltip,
        formatGroup: (points) => {
          const d = points[0]?.datum;
          if (!d) return "";
          return [
            formatDateLong(d.date),
            d.value !== null && `account value ${formatValue(d.value)}`,
            d.deposits !== null && `net deposits ${formatValue(d.deposits)}`,
            d.value !== null && d.deposits !== null && `return ${returnText(d.value, d.deposits, formatValue)}`,
          ]
            .filter(Boolean)
            .join(", ");
        },
      },
    });
  }, [data, formatValue, formatAxisValue, formatDate, formatDateLong]);

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-[var(--text-secondary)]">
        <LegendLine color={VALUE} label="Account value" />
        {hasDeposits && <LegendLine color={DEPOSITS} label="Net deposits" dashed />}
      </ul>
      <Chart
        definition={definition}
        height={height}
        initialWidth={560}
        onRender={enterNearEnd()}
        ariaLabel="Account value and net deposits over time"
        ariaDescription="Use the arrow keys to read each day."
        renderTooltipBody={({ points }) => {
          const d = points[0]?.datum;
          if (!d) return null;
          return (
            <>
              <TooltipRow label={formatDateLong(d.date)} value="" strong />
              <TooltipDivider />
              {d.value !== null && <TooltipRow color={1} label="Account value" value={formatValue(d.value)} />}
              {d.deposits !== null && <TooltipRow color={null} label="Net deposits" value={formatValue(d.deposits)} />}
              {d.value !== null && d.deposits !== null && (
                <TooltipRow label="Return" value={returnText(d.value, d.deposits, formatValue)} />
              )}
            </>
          );
        }}
      />
    </div>
  );
}

const returnText = (value: number, deposits: number, format: (n: number) => string) =>
  `${value >= deposits ? "+" : "−"}${format(Math.abs(value - deposits))}`;

function LegendLine({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <svg width="16" height="8" aria-hidden>
        <line
          x1="1"
          y1="4"
          x2="15"
          y2="4"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={dashed ? "3 3" : undefined}
        />
      </svg>
      {label}
    </li>
  );
}
