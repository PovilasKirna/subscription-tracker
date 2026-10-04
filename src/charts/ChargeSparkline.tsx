"use client";

import { Group } from "@visx/group";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar, BarRounded } from "@visx/shape";
import { ChartTooltip, TooltipRow, useChartTooltip } from "./ChartTooltip";
import { slotColor } from "./palette";
import type { Accessor, ColorSlot, TimelineCharge } from "./types";

type Props = {
  charges: readonly TimelineCharge[];
  slot: ColorSlot;
  muted?: boolean;
  formatValue: (n: number) => string;
  formatDate: (d: string) => string;
  width?: number;
  height?: number;
};

const getDate: Accessor<TimelineCharge, string> = (c) => c.date;
const getAmount: Accessor<TimelineCharge, number> = (c) => c.amount;

/** Tiny column sparkline of recent charges (fixed size: it lives in a table cell). */
export function ChargeSparkline({ charges, slot, muted, formatValue, formatDate, width = 96, height = 26 }: Props) {
  const { tooltipOpen, tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip, containerRef, TooltipInPortal } =
    useChartTooltip<TimelineCharge>();
  const x = scaleBand<string>({ domain: charges.map(getDate), range: [0, width], padding: 0.25 });
  const y = scaleLinear<number>({ domain: [0, Math.max(1, ...charges.map(getAmount))], range: [height, 2] });
  const barW = Math.min(8, x.bandwidth());
  return (
    <div className="relative" ref={containerRef}>
      <svg width={width} height={height} role="img" aria-label={`${charges.length} recent charges`}>
        <Group opacity={muted ? 0.5 : 1}>
          {charges.map((c) => {
            const bx = (x(c.date) ?? 0) + (x.bandwidth() - barW) / 2;
            const by = y(c.amount);
            const active = tooltipOpen && tooltipData?.date === c.date;
            return (
              <Group key={c.date}>
                <BarRounded
                  x={bx}
                  y={by}
                  width={barW}
                  height={height - by}
                  radius={2}
                  top
                  fill={slotColor(slot)}
                  opacity={tooltipOpen && !active ? 0.5 : 1}
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
          <TooltipRow slot={slot} label={formatDate(tooltipData.date)} value={formatValue(tooltipData.amount)} />
        </ChartTooltip>
      )}
    </div>
  );
}
