"use client";

import { barY, defineChart } from "@tanstack/charts";
import { bandX } from "@tanstack/charts/band";
import { crosshair } from "@tanstack/charts/crosshair";
import { Chart } from "@tanstack/charts/react/tooltip";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { useMemo } from "react";
import { TooltipDivider, TooltipRow } from "./ChartTooltip";
import { marks, seriesColor, tokens } from "./palette";
import { Difference, signed } from "./SpendingPace";
import { axisLine, chartTheme, chartTooltip, focusRing, gridLine, indexTicks, tickLabels } from "./theme";
import type { SpendingBarPoint } from "./types";

const BAR = seriesColor(1);
/** Expected spend for slots still to come: the bar colour at 30%. */
const EXPECTED = `color-mix(in oklab, ${BAR} 30%, transparent)`;

type Props = {
  data: SpendingBarPoint[];
  /** e.g. "October" / "September", for the tooltip. */
  label: string;
  previousLabel: string;
  formatValue: (n: number) => string;
  formatAxisValue: (n: number) => string;
  height?: number;
};

/** A slot with its index: x is the slot's position, so days, weekdays and months share one chart. */
type Row = SpendingBarPoint & { i: number; value: number };

/**
 * What was spent on each day (or month) of the period. Days still to come show what's expected,
 * faintly. The period before only appears in the tooltip.
 */
export function SpendingBars({ data, label, previousLabel, formatValue, formatAxisValue, height = 260 }: Props) {
  const definition = useMemo(() => {
    const rows: Row[] = data.map((d, i) => ({ ...d, i, value: d.amount ?? d.projectedAmount ?? 0 }));
    return defineChart({
      marks: [
        crosshair({ x: { band: { radius: 6, inset: -4, fill: tokens.grid, fillOpacity: 0.45 } }, y: false }),
        // Every slot is a target, even one with nothing spent: its tooltip still has the period before.
        bandX(rows, { x: "i", fill: "transparent" }),
        barY(
          rows.filter((r) => r.value > 0),
          {
            x: "i",
            y: "value",
            fill: (r) => (r.amount === null ? EXPECTED : BAR),
            maxThickness: marks.maxBar,
            radius: { end: marks.radius },
          },
        ),
      ],
      scales: {
        x: {
          // Fixed domain: slots keep their place whether or not they have a bar.
          scale: scaleBand<number>()
            .domain(rows.map((r) => r.i))
            .padding(0.25),
          axis: {
            line: axisLine,
            ticks: { values: indexTicks(data.length), size: 0, format: (i: number) => data[i]?.label ?? "" },
            tickLabels: { ...tickLabels, thin: false },
          },
        },
        y: {
          // The period before is only in the tooltip, so it doesn't stretch the axis.
          scale: scaleLinear().domain([0, Math.max(1, ...rows.map((r) => r.value))]),
          nice: true,
          grid: gridLine,
          axis: { line: false, ticks: { count: 4, size: 0, format: formatAxisValue }, tickLabels },
        },
      },
      margin: { top: 16, right: 12 },
      theme: chartTheme,
      focusRing,
      focus: "group-x",
      maxFocusDistance: Number.POSITIVE_INFINITY,
      tooltip: { ...chartTooltip, formatGroup: (points) => (points[0] ? slotLabel(points[0].datum) : "") },
    });

    /** Everything the tooltip shows, for the status region keyboard users hear. */
    function slotLabel(d: Row) {
      const now = d.amount ?? d.projectedAmount;
      return [
        d.title,
        d.amount !== null
          ? `${label} ${formatValue(d.amount)}`
          : d.projectedAmount !== null && `expected ${formatValue(d.projectedAmount)}`,
        d.previousAmount !== null && `${previousLabel} ${formatValue(d.previousAmount)}`,
        d.previousAmount !== null && now !== null && `difference ${signed(now - d.previousAmount, formatValue)}`,
      ]
        .filter(Boolean)
        .join(", ");
    }
  }, [data, label, previousLabel, formatValue, formatAxisValue]);

  return (
    <Chart
      definition={definition}
      height={height}
      initialWidth={560}
      ariaLabel={`${label} spending per period`}
      ariaDescription="Use the arrow keys to read each period."
      renderTooltipBody={({ points }) => {
        const d = points[0]?.datum;
        if (!d) return null;
        const now = d.amount ?? d.projectedAmount;
        return (
          <>
            <TooltipRow label={d.title} value="" strong />
            <TooltipDivider />
            {d.amount !== null ? (
              <TooltipRow color={1} label={label} value={formatValue(d.amount)} />
            ) : (
              d.projectedAmount !== null && <TooltipRow color={1} label="Expected" value={formatValue(d.projectedAmount)} />
            )}
            {d.previousAmount !== null && <TooltipRow color={null} label={previousLabel} value={formatValue(d.previousAmount)} />}
            {d.previousAmount !== null && now !== null && (
              <>
                <TooltipDivider />
                <TooltipRow label="Difference" value={<Difference value={now - d.previousAmount} format={formatValue} />} />
              </>
            )}
          </>
        );
      }}
    />
  );
}
