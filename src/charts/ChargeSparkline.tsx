"use client";

import { Group } from "@visx/group";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar, BarRounded } from "@visx/shape";
import { ChartTooltip, TooltipRow, useChartTooltip } from "./ChartTooltip";
import { otherOutline, seriesColor } from "./palette";
import type { Accessor, SeriesColor, TimelineCharge } from "./types";

type Props = {
  charges: readonly TimelineCharge[];
  color: SeriesColor;
  muted?: boolean;
  formatValue: (n: number) => string;
  formatDate: (d: string) => string;
  width?: number;
  height?: number;
};

const getDate: Accessor<TimelineCharge, string> = (c) => c.date;
const getAmount: Accessor<TimelineCharge, number> = (c) => c.amount;

/** Tiny column sparkline of recent charges (fixed size: it lives in a table cell). */
export function ChargeSparkline({ charges, color, muted, formatValue, formatDate, width = 96, height = 26 }: Props) {
  const { tooltipOpen, tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip, containerRef, TooltipInPortal } =
    useChartTooltip<TimelineCharge>();
  const x = scaleBand<string>({ domain: charges.map(getDate), range: [0, width], padding: 0.25 });
  const y = scaleLinear<number>({ domain: [0, Math.max(1, ...charges.map(getAmount))], range: [height, 2] });
  const barW = Math.min(8, x.bandwidth());
  // "Other" alone gets a 1px graphite outline, inset so the bar keeps its footprint.
  const outline = otherOutline(color);
  const inset = "stroke" in outline ? 0.5 : 0;
  // Not focusable (one per table row would flood the tab order): the name carries the gist instead,
  // and the full list is in the subscription drawer.
  const amounts = charges.map(getAmount);
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
    <div className="relative" ref={containerRef}>
      <svg width={width} height={height} role="img" aria-label={label}>
        <Group opacity={muted ? 0.5 : 1}>
          {charges.map((c) => {
            const bx = (x(c.date) ?? 0) + (x.bandwidth() - barW) / 2;
            const by = y(c.amount);
            const active = tooltipOpen && tooltipData?.date === c.date;
            return (
              <Group key={c.date}>
                <BarRounded
                  x={bx + inset}
                  y={by + inset}
                  width={Math.max(0, barW - inset * 2)}
                  height={Math.max(0, height - by - inset * 2)}
                  radius={2}
                  top
                  fill={seriesColor(color)}
                  opacity={tooltipOpen && !active ? 0.5 : 1}
                  {...outline}
                />
                <Bar
                  x={x(c.date) ?? 0}
                  y={0}
                  width={x.step()}
                  height={height}
                  fill="transparent"
                  onMouseEnter={() => showTooltip({ tooltipData: c, tooltipLeft: bx, tooltipTop: by })}
                  onMouseLeave={hideTooltip}
                />
              </Group>
            );
          })}
        </Group>
      </svg>
      {tooltipOpen && tooltipData && (
        <ChartTooltip Portal={TooltipInPortal} left={tooltipLeft} top={tooltipTop}>
          <TooltipRow color={color} label={formatDate(tooltipData.date)} value={formatValue(tooltipData.amount)} />
        </ChartTooltip>
      )}
    </div>
  );
}
