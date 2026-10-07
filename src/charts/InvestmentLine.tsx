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
import type { InvestmentDay } from "./types";

const FLUID = { display: "block", width: "100%", height: "auto" } as const;
const margin = { top: 20, right: 16, bottom: 28, left: 60 };
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
export function InvestmentLine(props: Props) {
  const height = props.height ?? 280;
  const hasDeposits = props.data.some((d) => d.deposits !== null);
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-[var(--text-secondary)]">
        <LegendLine color={VALUE} label="Account value" />
        {hasDeposits && <LegendLine color={DEPOSITS} label="Net deposits" dashed />}
      </ul>
      <ParentSize initialSize={{ width: 560 }} style={{ height }} debounceTime={40}>
        {({ width }) => (width > 0 ? <Plot {...props} width={width} height={height} /> : null)}
      </ParentSize>
    </div>
  );
}

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

function Plot({
  data,
  formatValue,
  formatAxisValue,
  formatDate,
  formatDateLong,
  width,
  height,
}: Props & { width: number; height: number }) {
  const { tooltipOpen, tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip, containerRef, TooltipInPortal } =
    useChartTooltip<number>();
  const xMax = Math.max(0, width - margin.left - margin.right);
  const yMax = Math.max(0, height - margin.top - margin.bottom);
  const last = data.length - 1;

  const xScale = useMemo(
    () => scaleUtc<number>({ domain: [toTime(data[0].date), toTime(data[last].date)], range: [0, xMax] }),
    [data, last, xMax],
  );
  // Two lines (no area), so the axis can hug the data without exaggerating anything.
  const yScale = useMemo(() => {
    const values = data.flatMap((d) => [d.value, d.deposits]).filter((v): v is number => v !== null);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max((hi - lo) * 0.12, Math.abs(hi) * 0.02, 1);
    // Down to zero at most, unless net deposits went negative (more withdrawn than paid in).
    return scaleLinear<number>({ domain: [lo < 0 ? lo - pad : Math.max(0, lo - pad), hi + pad], range: [yMax, 0], nice: true });
  }, [data, yMax]);

  const x = (d: InvestmentDay) => xScale(toTime(d.date)) ?? 0;
  const valueDays = data.filter((d) => d.value !== null);
  const depositDays = data.filter((d) => d.deposits !== null);
  const end = valueDays.at(-1);

  const yOf = (d: InvestmentDay) => yScale(d.value ?? d.deposits ?? 0) ?? 0;
  const showAt = (i: number) =>
    showTooltip({ tooltipData: i, tooltipLeft: x(data[i]) + margin.left, tooltipTop: yOf(data[i]) + margin.top });
  const nearest = (px: number) => {
    const t = xScale.invert(px - margin.left).getTime();
    const i = Math.round((t - toTime(data[0].date).getTime()) / 86_400_000);
    return Math.min(last, Math.max(0, i));
  };
  const onPointer = (e: PointerEvent<SVGRectElement>) => {
    const p = localPoint(e);
    if (p) showAt(nearest(p.x));
  };
  const onKey = (e: KeyboardEvent<SVGRectElement>) => {
    const current = tooltipOpen && tooltipData !== undefined ? tooltipData : last;
    const next = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    showAt(Math.min(last, Math.max(0, next)));
  };
  const active = tooltipOpen && tooltipData !== undefined ? data[tooltipData] : null;

  return (
    <div className="relative" ref={containerRef}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={FLUID}
        role="img"
        aria-label="Account value and net deposits over time"
      >
        <Group left={margin.left} top={margin.top}>
          <GridRows scale={yScale} width={xMax} numTicks={4} stroke={tokens.grid} strokeWidth={1} />
          {active && <Line from={{ x: x(active), y: 0 }} to={{ x: x(active), y: yMax }} stroke={tokens.axis} strokeWidth={1} />}
          <LinePath
            data={depositDays}
            x={x}
            y={(d) => yScale(d.deposits ?? 0) ?? 0}
            stroke={DEPOSITS}
            strokeWidth={marks.line}
            strokeDasharray="4 4"
            strokeLinecap="round"
          />
          <LinePath
            data={valueDays}
            x={x}
            y={(d) => yScale(d.value ?? 0) ?? 0}
            stroke={VALUE}
            strokeWidth={marks.line}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {end && (
            <circle
              cx={x(end)}
              cy={yScale(end.value ?? 0)}
              r={marks.markerR}
              fill={VALUE}
              stroke={tokens.surface}
              strokeWidth={marks.ring}
            />
          )}
          {active && active.value !== null && active !== end && (
            <circle
              cx={x(active)}
              cy={yScale(active.value)}
              r={marks.markerR}
              fill={VALUE}
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
            numTicks={Math.max(2, Math.min(6, Math.floor(xMax / 90)))}
            stroke={tokens.axis}
            hideTicks
            tickFormat={(d) => formatDate((d as Date).toISOString().slice(0, 10))}
            tickLabelProps={() => ({ ...axisLabel, textAnchor: "middle", dy: 4 })}
          />
        </Group>
        <Bar
          x={margin.left}
          y={margin.top}
          width={xMax}
          height={yMax}
          fill="transparent"
          tabIndex={0}
          aria-label="Account value by day. Use the arrow keys to read each day."
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
          ? [
              formatDateLong(active.date),
              active.value !== null && `account value ${formatValue(active.value)}`,
              active.deposits !== null && `net deposits ${formatValue(active.deposits)}`,
            ]
              .filter(Boolean)
              .join(", ")
          : ""}
      </div>
      {active && (
        <ChartTooltip Portal={TooltipInPortal} left={tooltipLeft} top={tooltipTop}>
          <TooltipRow label={formatDateLong(active.date)} value="" strong />
          <div className="my-1.5 h-px bg-[var(--grid)]" />
          {active.value !== null && <TooltipRow color={1} label="Account value" value={formatValue(active.value)} />}
          {active.deposits !== null && <TooltipRow color={null} label="Net deposits" value={formatValue(active.deposits)} />}
          {active.value !== null && active.deposits !== null && (
            <TooltipRow
              label="Return"
              value={`${active.value >= active.deposits ? "+" : "−"}${formatValue(Math.abs(active.value - active.deposits))}`}
            />
          )}
        </ChartTooltip>
      )}
    </div>
  );
}
