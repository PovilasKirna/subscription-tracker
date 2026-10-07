"use client";

import { AxisBottom, AxisLeft } from "@visx/axis";
import { localPoint } from "@visx/event";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleLinear } from "@visx/scale";
import { AreaClosed, Bar, Line, LinePath } from "@visx/shape";
import { type KeyboardEvent, type PointerEvent, useId, useMemo } from "react";
import { ChartTooltip, TooltipRow, useChartTooltip } from "./ChartTooltip";
import { axisLabel, marks, seriesColor, tokens } from "./palette";
import type { SpendingPacePoint } from "./types";

const FLUID = { display: "block", width: "100%", height: "auto" } as const;
const margin = { top: 16, right: 64, bottom: 28, left: 52 };
const NEUTRAL = seriesColor(1);
const PREVIOUS = "var(--series-other)";
const PROJECTED = "var(--text-muted)";
/** This period ahead of the last one (spent more) is red; behind it (spent less) is green. */
const MORE = "var(--delta-bad)";
const LESS = "var(--delta-good)";

type Props = {
  /** Every point of the period; `spent` stops at today, `projected` carries on to the end. */
  data: SpendingPacePoint[];
  /** e.g. "October" / "September", for the tooltip. */
  label: string;
  previousLabel: string;
  formatValue: (n: number) => string;
  formatAxisValue: (n: number) => string;
  /** Pills on the right edge, e.g. the projected month-end and last month's total. */
  endLabels?: { value: number; muted?: boolean }[];
  height?: number;
};

/**
 * Spending so far in a period against the period before, Revolut-style: the line and the area under
 * it (fading out downwards) are green if you're behind last period's pace today, red if ahead. The
 * tooltip gives the difference, so colour never carries the meaning alone.
 */
export function SpendingPace(props: Props) {
  const height = props.height ?? 260;
  return (
    <ParentSize initialSize={{ width: 560 }} style={{ height }} debounceTime={40}>
      {({ width }) => (width > 0 ? <Plot {...props} width={width} height={height} /> : null)}
    </ParentSize>
  );
}

/**
 * Red if this period is ahead of the last one at its latest point (today, or the period's end), green
 * if behind; blue when there's nothing to compare. One colour for the whole line: a day or two of
 * being ahead mid-month doesn't matter, only where you stand now.
 */
function standing(points: SpendingPacePoint[]): string {
  const latest = points.filter((p) => p.spent !== null && p.previous !== null).at(-1);
  if (!latest) return NEUTRAL;
  return (latest.spent ?? 0) > (latest.previous ?? 0) ? MORE : LESS;
}

function Plot({
  data,
  label,
  previousLabel,
  formatValue,
  formatAxisValue,
  endLabels = [],
  width,
  height,
}: Props & { width: number; height: number }) {
  const { tooltipOpen, tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip, containerRef, TooltipInPortal } =
    useChartTooltip<number>();
  const xMax = Math.max(0, width - margin.left - margin.right);
  const yMax = Math.max(0, height - margin.top - margin.bottom);
  const last = data.length - 1;
  const id = useId().replace(/:/g, "");

  const xScale = useMemo(() => scaleLinear<number>({ domain: [0, Math.max(1, last)], range: [0, xMax] }), [last, xMax]);
  const yScale = useMemo(() => {
    const max = Math.max(1, ...data.flatMap((d) => [d.spent ?? 0, d.previous ?? 0, d.projected ?? 0]), ...endLabels.map((l) => l.value));
    return scaleLinear<number>({ domain: [0, max], range: [yMax, 0], nice: true });
  }, [data, endLabels, yMax]);

  const x = (i: number) => xScale(i) ?? 0;
  const indexed = data.map((d, i) => ({ ...d, i }));
  type P = (typeof indexed)[number];
  const spent = indexed.filter((d) => d.spent !== null);
  const previous = indexed.filter((d) => d.previous !== null);
  const projected = indexed.filter((d) => d.projected !== null);
  const ySpent = (d: P) => yScale(d.spent ?? 0) ?? 0;
  const today = spent.at(-1);
  const color = standing(data);

  // Right-edge pills, nudged apart when they'd overlap.
  const pills: { value: number; muted?: boolean; y: number }[] = [];
  for (const l of [...endLabels].sort((a, b) => b.value - a.value)) {
    const y = yScale(l.value) ?? 0;
    const prev = pills.at(-1);
    pills.push({ ...l, y: prev && y - prev.y < 20 ? prev.y + 20 : y });
  }

  const showAt = (i: number) => {
    const d = data[i];
    const v = d.spent ?? d.projected ?? d.previous ?? 0;
    showTooltip({ tooltipData: i, tooltipLeft: x(i) + margin.left, tooltipTop: (yScale(v) ?? 0) + margin.top });
  };
  const onPointer = (e: PointerEvent<SVGRectElement>) => {
    const p = localPoint(e);
    if (p) showAt(Math.min(last, Math.max(0, Math.round(xScale.invert(p.x - margin.left)))));
  };
  const onKey = (e: KeyboardEvent<SVGRectElement>) => {
    const current = tooltipOpen && tooltipData !== undefined ? tooltipData : (today?.i ?? 0);
    const next = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    showAt(Math.min(last, Math.max(0, next)));
  };
  const activeIndex = tooltipOpen && tooltipData !== undefined ? tooltipData : null;
  const active = activeIndex !== null ? data[activeIndex] : null;
  // About six evenly spaced ticks, always including the last point.
  const every = Math.max(1, Math.round(data.length / 6));
  const tickValues = data.map((_, i) => i).filter((i) => i === last || (i % every === 0 && last - i >= every / 2));

  return (
    <div className="relative" ref={containerRef}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={FLUID} role="img" aria-label={`${label} spending`}>
        <defs>
          {/* The area under the line fades out downwards. */}
          <linearGradient id={`${id}-fade`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.34} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Group left={margin.left} top={margin.top}>
          <GridRows scale={yScale} width={xMax} numTicks={4} stroke={tokens.grid} strokeWidth={1} />
          {activeIndex !== null && (
            <Line from={{ x: x(activeIndex), y: 0 }} to={{ x: x(activeIndex), y: yMax }} stroke={tokens.axis} strokeWidth={1} />
          )}
          <AreaClosed<P> data={spent} x={(d) => x(d.i)} y={ySpent} yScale={yScale} fill={`url(#${id}-fade)`} />
          <LinePath<P>
            data={previous}
            x={(d) => x(d.i)}
            y={(d) => yScale(d.previous ?? 0) ?? 0}
            stroke={PREVIOUS}
            strokeWidth={marks.line}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <LinePath<P>
            data={projected}
            x={(d) => x(d.i)}
            y={(d) => yScale(d.projected ?? 0) ?? 0}
            stroke={PROJECTED}
            strokeWidth={marks.line}
            strokeDasharray="4 4"
            strokeLinecap="round"
          />
          <LinePath<P>
            data={spent}
            x={(d) => x(d.i)}
            y={ySpent}
            stroke={color}
            strokeWidth={marks.line}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {today && (
            <circle cx={x(today.i)} cy={ySpent(today)} r={marks.markerR} fill={color} stroke={tokens.surface} strokeWidth={marks.ring} />
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
            tickValues={tickValues}
            stroke={tokens.axis}
            hideTicks
            tickFormat={(i) => data[Number(i)]?.label ?? ""}
            tickLabelProps={() => ({ ...axisLabel, textAnchor: "middle", dy: 4 })}
          />
          {pills.map((p) => (
            <g key={`${p.value}-${p.muted}`} transform={`translate(${xMax + 8}, ${p.y})`}>
              <rect x={0} y={-10} width={margin.right - 10} height={20} rx={6} fill={tokens.grid} />
              <text
                x={(margin.right - 10) / 2}
                y={4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={p.muted ? tokens.textMuted : tokens.textPrimary}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatAxisValue(p.value)}
              </text>
            </g>
          ))}
        </Group>
        <Bar
          x={margin.left}
          y={margin.top}
          width={xMax}
          height={yMax}
          fill="transparent"
          tabIndex={0}
          aria-label={`${label} spending. Use the arrow keys to read each point.`}
          onPointerMove={onPointer}
          onPointerLeave={hideTooltip}
          onFocus={() => showAt(today?.i ?? 0)}
          onBlur={hideTooltip}
          onKeyDown={onKey}
          style={{ outline: "none" }}
        />
      </svg>
      {active && (
        <ChartTooltip Portal={TooltipInPortal} left={tooltipLeft} top={tooltipTop}>
          <TooltipRow label={active.title} value="" strong />
          <div className="my-1.5 h-px bg-[var(--grid)]" />
          {active.spent !== null && <TooltipRow label={label} value={formatValue(active.spent)} />}
          {active.spent === null && active.projected !== null && <TooltipRow label="Projected" value={formatValue(active.projected)} />}
          {active.previous !== null && <TooltipRow color={null} label={previousLabel} value={formatValue(active.previous)} />}
          {active.previous !== null && (active.spent ?? active.projected) !== null && (
            <>
              <div className="my-1.5 h-px bg-[var(--grid)]" />
              <TooltipRow
                label="Difference"
                value={<Difference value={(active.spent ?? active.projected ?? 0) - active.previous} format={formatValue} />}
              />
            </>
          )}
        </ChartTooltip>
      )}
    </div>
  );
}

/** This period minus the last one at the same point: signed, red when more was spent, green when less. */
export function Difference({ value, format }: { value: number; format: (n: number) => string }) {
  const more = value > 0.005;
  const less = value < -0.005;
  return (
    <span style={{ color: more ? MORE : less ? LESS : undefined }}>
      {more ? "+" : less ? "−" : "±"}
      {format(Math.abs(value))}
    </span>
  );
}
