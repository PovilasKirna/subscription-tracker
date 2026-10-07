"use client";

import { barY, defineChart } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react/tooltip";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { useMemo } from "react";
import { TooltipRow } from "./ChartTooltip";
import { otherOutline, seriesColor } from "./palette";
import { chartTheme, chartTooltip, focusRing } from "./theme";
import type { SeriesColor, TimelineCharge } from "./types";

type Props = {
  charges: readonly TimelineCharge[];
  color: SeriesColor;
  muted?: boolean;
  formatValue: (n: number) => string;
  formatDate: (d: string) => string;
  width?: number;
  height?: number;
};

/** Tiny column sparkline of recent charges (fixed size: it lives in a table cell). */
export function ChargeSparkline({ charges, color, muted, formatValue, formatDate, width = 96, height = 26 }: Props) {
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(charges, {
            x: "date",
            y: "amount",
            fill: seriesColor(color),
            // "Other" alone gets a 1px graphite outline, inset so the bar keeps its footprint.
            ...otherOutline(color),
            maxThickness: 8,
            radius: { end: 2 },
            states: [{ when: { focus: "unmatched" }, style: { opacity: 0.5 } }],
          }),
        ],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.25) },
          y: { scale: scaleLinear().domain([0, Math.max(1, ...charges.map((c) => c.amount))]) },
        },
        guides: false,
        margin: { top: 2, right: 0, bottom: 0, left: 0 },
        theme: chartTheme,
        focusRing,
        // Not focusable (one per table row would flood the tab order): the name carries the gist
        // instead, and the full list is in the subscription drawer.
        keyboard: false,
        tooltip: chartTooltip,
      }),
    [charges, color],
  );

  const amounts = charges.map((c) => c.amount);
  const latest = charges.at(-1);
  const label = latest
    ? [
        `${charges.length} recent charge${charges.length === 1 ? "" : "s"}`,
        Math.min(...amounts) !== Math.max(...amounts) && `${formatValue(Math.min(...amounts))} to ${formatValue(Math.max(...amounts))}`,
        `latest ${formatValue(latest.amount)} on ${formatDate(latest.date)}`,
      ]
        .filter(Boolean)
        .join(", ")
    : "No charges";

  return (
    <Chart
      definition={definition}
      width={width}
      height={height}
      ariaLabel={label}
      style={{ opacity: muted ? 0.5 : 1 }}
      renderTooltipBody={({ points }) => {
        const c = points[0]?.datum;
        return c ? <TooltipRow color={color} label={formatDate(c.date)} value={formatValue(c.amount)} /> : null;
      }}
    />
  );
}
