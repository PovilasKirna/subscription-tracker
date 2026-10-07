"use client";

import { barY, defineChart } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react/tooltip";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { useMemo } from "react";
import { TooltipRow } from "./ChartTooltip";
import { marks, otherOutline, seriesColor } from "./palette";
import { axisLine, chartTheme, chartTooltip, focusRing, gridLine, tickLabels } from "./theme";
import type { SeriesColor, TimelineCharge } from "./types";

type Props = {
  charges: readonly TimelineCharge[];
  color: SeriesColor;
  formatValue: (n: number) => string;
  formatAxisValue: (n: number) => string;
  formatDate: (d: string) => string;
  formatTick: (d: string) => string;
  height?: number;
  /**
   * The chart is mouse-only; this description says where the same charges are listed as text.
   * Defaults to the subscription drawer's "Charges" list.
   */
  listHint?: string;
};

/** Every charge of one subscription as a column, oldest → newest. */
export function ChargeHistory({
  charges,
  color,
  formatValue,
  formatAxisValue,
  formatDate,
  formatTick,
  height = 160,
  listHint = "Every charge is also listed under Charges below.",
}: Props) {
  const definition = useMemo(() => {
    const latest = charges.at(-1);
    return defineChart({
      marks: [
        barY(charges, {
          x: "date",
          y: "amount",
          fill: seriesColor(color),
          // "Other" alone gets a 1px graphite outline.
          ...otherOutline(color),
          maxThickness: marks.maxBar,
          radius: { end: marks.radius },
          states: [{ when: { focus: "unmatched" }, style: { opacity: 0.55 } }],
        }),
      ],
      scales: {
        x: {
          scale: () => scaleBand<string>().padding(0.3),
          axis: {
            line: axisLine,
            ticks: { size: 0, format: formatTick },
            // Thin labels so they never collide, always keeping the latest charge.
            tickLabels: { ...tickLabels, thin: { minGap: 12, keep: latest ? [latest.date] : [] } },
          },
        },
        y: {
          scale: scaleLinear().domain([0, Math.max(1, ...charges.map((c) => c.amount))]),
          nice: true,
          grid: gridLine,
          axis: { line: false, ticks: { count: 3, size: 0, format: formatAxisValue }, tickLabels },
        },
      },
      theme: chartTheme,
      focusRing,
      // The whole column, not just the bar, picks a charge.
      focus: "nearest-x",
      maxFocusDistance: Number.POSITIVE_INFINITY,
      keyboard: false,
      tooltip: chartTooltip,
    });
  }, [charges, color, formatTick, formatAxisValue]);

  const first = charges[0];
  const latest = charges.at(-1);
  const label =
    first && latest
      ? `Charge history chart: ${charges.length} charges from ${formatDate(first.date)} to ${formatDate(latest.date)}, latest ${formatValue(latest.amount)}.`
      : "Charge history chart: no charges";

  return (
    <Chart
      definition={definition}
      height={height}
      initialWidth={520}
      ariaLabel={label}
      ariaDescription={listHint}
      renderTooltipBody={({ points }) => {
        const c = points[0]?.datum;
        return c ? <TooltipRow color={color} label={formatDate(c.date)} value={formatValue(c.amount)} /> : null;
      }}
    />
  );
}
