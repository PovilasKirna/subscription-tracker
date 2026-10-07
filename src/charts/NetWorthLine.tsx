"use client";

import { AxisBottom, AxisLeft } from "@visx/axis";
import { localPoint } from "@visx/event";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleLinear, scaleUtc } from "@visx/scale";
import { Bar, Line, LinePath } from "@visx/shape";
import { type KeyboardEvent, type PointerEvent, useMemo } from "react";
import { ChartTooltip, TooltipRow, useChartTooltip } from "./ChartTooltip";
import { axisLabel, marks, seriesColor, tokens } from "./palette";
import type { NetWorthDay } from "./types";

const FLUID = { display: "block", width: "100%", height: "auto" } as const;
const margin = { top: 24, right: 16, bottom: 28, left: 60 };
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
export function NetWorthLine(props: Props) {
  const height = props.height ?? 280;
  return (
    <ParentSize initialSize={{ width: 560 }} style={{ height }} debounceTime={40}>
      {({ width }) => (width > 0 ? <Plot {...props} width={width} height={height} /> : null)}
    </ParentSize>
  );
}

function Plot({
  data,
  formatValue,
  formatAxisValue,
  formatDate,
  formatDateLong,
  split,
  width,
  height,
}: Props & { width: number; height: number }) {
  const { tooltipOpen, tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip, containerRef, TooltipInPortal } =
    useChartTooltip<number>();
  const xMax = Math.max(0, width - margin.left - margin.right);
  const yMax = Math.max(0, height - margin.top - margin.bottom);

  const xScale = useMemo(
    () => scaleUtc<number>({ domain: [toTime(data[0].date), toTime(data[data.length - 1].date)], range: [0, xMax] }),
    [data, xMax],
  );
  // Net worth rarely moves by its whole size, so the axis hugs the data (a line, not an area, so
  // the non-zero baseline doesn't exaggerate anything).
  const yScale = useMemo(() => {
    const values = data.map((d) => d.total);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max((hi - lo) * 0.15, Math.abs(hi) * 0.02, 1);
    return scaleLinear<number>({ domain: [lo - pad, hi + pad], range: [yMax, 0], nice: true });
  }, [data, yMax]);

  const x = (i: number) => xScale(toTime(data[i].date)) ?? 0;
  const y = (i: number) => yScale(data[i].total) ?? 0;
  const last = data.length - 1;

  const showAt = (i: number) => showTooltip({ tooltipData: i, tooltipLeft: x(i) + margin.left, tooltipTop: y(i) + margin.top });

  const nearest = (px: number) => {
    const t = xScale.invert(px - margin.left).getTime();
    let best = 0;
    for (let i = 1; i < data.length; i++) {
      if (Math.abs(toTime(data[i].date).getTime() - t) < Math.abs(toTime(data[best].date).getTime() - t)) best = i;
    }
    return best;
  };
  const onPointer = (e: PointerEvent<SVGRectElement>) => {
    const p = localPoint(e);
    if (p) showAt(nearest(p.x));
  };
  const onKey = (e: KeyboardEvent<SVGRectElement>) => {
    const current = tooltipOpen && tooltipData !== undefined ? tooltipData : last;
    const step = { ArrowLeft: -1, ArrowRight: 1, Home: -current, End: last - current }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    showAt(Math.min(last, Math.max(0, current + step)));
  };

  const ticks = Math.max(2, Math.min(6, Math.floor(xMax / 90)));
  const active = tooltipOpen && tooltipData !== undefined ? data[tooltipData] : null;

  return (
    <div className="relative" ref={containerRef}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={FLUID} role="img" aria-label="Net worth over time">
        <Group left={margin.left} top={margin.top}>
          <GridRows scale={yScale} width={xMax} numTicks={4} stroke={tokens.grid} strokeWidth={1} />
          {active && tooltipData !== undefined && (
            <Line from={{ x: x(tooltipData), y: 0 }} to={{ x: x(tooltipData), y: yMax }} stroke={tokens.axis} strokeWidth={1} />
          )}
          <LinePath
            data={data}
            x={(_, i) => x(i)}
            y={(_, i) => y(i)}
            stroke={LINE}
            strokeWidth={marks.line}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* End dot + direct label: today's value. */}
          <circle cx={x(last)} cy={y(last)} r={marks.markerR} fill={LINE} stroke={tokens.surface} strokeWidth={marks.ring} />
          <text
            x={x(last)}
            y={y(last) - 10}
            textAnchor="end"
            fontSize={11.5}
            fontWeight={600}
            fill={tokens.textPrimary}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatAxisValue(data[last].total)}
          </text>
          {active && tooltipData !== undefined && tooltipData !== last && (
            <circle
              cx={x(tooltipData)}
              cy={y(tooltipData)}
              r={marks.markerR}
              fill={LINE}
              stroke={tokens.surface}
              strokeWidth={marks.ring}
            />
          )}
          <AxisLeft
            scale={yScale}
            numTicks={4}
            hideAxisLine
            hideTicks
            tickFormat={(v) => formatAxisValue(Number(v))}
            tickLabelProps={() => ({ ...axisLabel, textAnchor: "end", dx: -6, dy: 3 })}
          />
          <AxisBottom
            top={yMax}
            scale={xScale}
            numTicks={ticks}
            stroke={tokens.axis}
            hideTicks
            tickFormat={(d) => formatDate((d as Date).toISOString().slice(0, 10))}
            tickLabelProps={() => ({ ...axisLabel, textAnchor: "middle", dy: 4 })}
          />
        </Group>
        {/* The crosshair finds the date: the whole plot is the hit target; arrow keys step through days. */}
        <Bar
          x={margin.left}
          y={margin.top}
          width={xMax}
          height={yMax}
          fill="transparent"
          tabIndex={0}
          aria-label={`Net worth from ${formatDateLong(data[0].date)} to ${formatDateLong(data[last].date)}. Use the arrow keys to read each day.`}
          onPointerMove={onPointer}
          onPointerLeave={hideTooltip}
          onFocus={() => showAt(last)}
          onBlur={hideTooltip}
          onKeyDown={onKey}
          style={{ outline: "none" }}
        />
      </svg>
      {/* Keyboard steps move only the tooltip, so the selected point is announced here. */}
      <div role="status" aria-live="polite" className="sr-only">
        {active
          ? `${formatDateLong(active.date)}: ${formatValue(active.total)}${split ? `, bank accounts ${formatValue(active.bank)}, investments ${formatValue(active.broker)}` : ""}`
          : ""}
      </div>
      {active && (
        <ChartTooltip Portal={TooltipInPortal} left={tooltipLeft} top={tooltipTop}>
          <TooltipRow label={formatDateLong(active.date)} value={formatValue(active.total)} strong />
          {split && (
            <>
              <div className="my-1.5 h-px bg-[var(--grid)]" />
              <TooltipRow label="Bank accounts" value={formatValue(active.bank)} />
              <TooltipRow label="Investments" value={formatValue(active.broker)} />
            </>
          )}
        </ChartTooltip>
      )}
    </div>
  );
}
