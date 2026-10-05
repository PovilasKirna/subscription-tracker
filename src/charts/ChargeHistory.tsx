"use client";

import { AxisBottom, AxisLeft } from "@visx/axis";
import { localPoint } from "@visx/event";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar, BarRounded } from "@visx/shape";
import { useMemo } from "react";
import { ChartTooltip, TooltipRow, useChartTooltip } from "./ChartTooltip";
import { axisLabel, marks, otherOutline, seriesColor, tokens } from "./palette";
import type { Accessor, SeriesColor, TimelineCharge } from "./types";

type Props = {
  charges: readonly TimelineCharge[];
  color: SeriesColor;
  formatValue: (n: number) => string;
  formatAxisValue: (n: number) => string;
  formatDate: (d: string) => string;
  formatTick: (d: string) => string;
  height?: number;
  /**
   * The chart is mouse-only and hidden from assistive tech; this visually hidden line says where the
   * same charges are listed as text. Defaults to the subscription drawer's "Charges" list.
   */
  listHint?: string;
};

const margin = { top: 8, right: 4, bottom: 24, left: 44 };
const FLUID = { display: "block", width: "100%", height: "auto" } as const;
const getDate: Accessor<TimelineCharge, string> = (c) => c.date;
const getAmount: Accessor<TimelineCharge, number> = (c) => c.amount;

/** Every charge of one subscription as a column, oldest → newest. */
export function ChargeHistory(props: Props) {
  const height = props.height ?? 160;
  return (
    <ParentSize initialSize={{ width: 520 }} style={{ height }} debounceTime={40}>
      {({ width }) => (width > 0 ? <Columns {...props} width={width} height={height} /> : null)}
    </ParentSize>
  );
}

function Columns({
  charges,
  color,
  formatValue,
  formatAxisValue,
  formatDate,
  formatTick,
  listHint = "Every charge is also listed under Charges below.",
  width,
  height,
}: Props & { width: number; height: number }) {
  const { tooltipOpen, tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip, containerRef, TooltipInPortal } =
    useChartTooltip<TimelineCharge>();
  const xMax = Math.max(0, width - margin.left - margin.right);
  const yMax = Math.max(0, height - margin.top - margin.bottom);
  const x = useMemo(() => scaleBand<string>({ domain: charges.map(getDate), range: [0, xMax], padding: 0.3 }), [charges, xMax]);
  const y = useMemo(
    () => scaleLinear<number>({ domain: [0, Math.max(1, ...charges.map(getAmount))], range: [yMax, 0], nice: true }),
    [charges, yMax],
  );
  const barW = Math.min(marks.maxBar, x.bandwidth());
  const every = Math.max(1, Math.ceil(charges.length / Math.max(1, Math.floor(xMax / 64))));
  const ticks = charges.map(getDate).filter((_, i) => (charges.length - 1 - i) % every === 0);
  // "Other" alone gets a 1px graphite outline, inset so the bar keeps its footprint.
  const outline = otherOutline(color);
  const inset = "stroke" in outline ? 0.5 : 0;
  const first = charges[0];
  const latest = charges.at(-1);

  return (
    <div className="relative" ref={containerRef}>
      {first && latest && (
        <p className="sr-only">
          Charge history chart: {charges.length} charges from {formatDate(first.date)} to {formatDate(latest.date)}, latest{" "}
          {formatValue(latest.amount)}. {listHint}
        </p>
      )}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={FLUID} aria-hidden>
        <Group left={margin.left} top={margin.top}>
          <GridRows scale={y} width={xMax} numTicks={3} stroke={tokens.grid} strokeWidth={1} />
          {charges.map((c) => {
            const bx = (x(c.date) ?? 0) + (x.bandwidth() - barW) / 2;
            const by = y(c.amount);
            const dim = tooltipOpen && tooltipData?.date !== c.date;
            return (
              <Group key={c.date}>
                <BarRounded
                  x={bx + inset}
                  y={by + inset}
                  width={Math.max(0, barW - inset * 2)}
                  height={Math.max(0, yMax - by - inset * 2)}
                  radius={marks.radius}
                  top
                  fill={seriesColor(color)}
                  opacity={dim ? 0.55 : 1}
                  {...outline}
                />
                <Bar
                  x={(x(c.date) ?? 0) - (x.step() - x.bandwidth()) / 2}
                  y={0}
                  width={x.step()}
                  height={yMax}
                  fill="transparent"
                  onMouseMove={(e) => {
                    const p = localPoint(e);
                    showTooltip({ tooltipData: c, tooltipLeft: p?.x ?? bx, tooltipTop: p?.y ?? by });
                  }}
                  onMouseLeave={hideTooltip}
                />
              </Group>
            );
          })}
          <AxisLeft
            scale={y}
            numTicks={3}
            hideAxisLine
            hideTicks
            tickFormat={(v) => formatAxisValue(Number(v))}
            tickLabelProps={() => ({ ...axisLabel, textAnchor: "end", dx: -6, dy: 3 })}
          />
          <AxisBottom
            top={yMax}
            scale={x}
            tickValues={ticks}
            stroke={tokens.axis}
            hideTicks
            tickFormat={(d) => formatTick(d)}
            tickLabelProps={() => ({ ...axisLabel, textAnchor: "middle", dy: 2 })}
          />
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
