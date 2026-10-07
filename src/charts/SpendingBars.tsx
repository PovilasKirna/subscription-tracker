"use client";

import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar, BarRounded } from "@visx/shape";
import { useMemo } from "react";
import { ChartTooltip, TooltipRow, useChartTooltip, useRovingFocus } from "./ChartTooltip";
import { axisLabel, focusRing, marks, seriesColor, tokens } from "./palette";
import { Difference } from "./SpendingPace";
import type { SpendingBarPoint } from "./types";

const FLUID = { display: "block", width: "100%", height: "auto" } as const;
const margin = { top: 16, right: 12, bottom: 28, left: 52 };
const BAR = seriesColor(1);

type Props = {
  data: SpendingBarPoint[];
  /** e.g. "October" / "September", for the tooltip. */
  label: string;
  previousLabel: string;
  formatValue: (n: number) => string;
  formatAxisValue: (n: number) => string;
  height?: number;
};

/**
 * What was spent on each day (or month) of the period. Days still to come show what's expected,
 * faintly; a day with more refunds than spending goes below zero. The period before only appears
 * in the tooltip. One tab stop: the arrow keys move between named bars (roving focus).
 */
export function SpendingBars(props: Props) {
  const height = props.height ?? 260;
  return (
    <ParentSize initialSize={{ width: 560 }} style={{ height }} debounceTime={40}>
      {({ width }) => (width > 0 ? <Plot {...props} width={width} height={height} /> : null)}
    </ParentSize>
  );
}

function Plot({ data, label, previousLabel, formatValue, formatAxisValue, width, height }: Props & { width: number; height: number }) {
  const { tooltipOpen, tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip, containerRef, TooltipInPortal } =
    useChartTooltip<number>();
  const xMax = Math.max(0, width - margin.left - margin.right);
  const yMax = Math.max(0, height - margin.top - margin.bottom);
  const count = data.length;
  const keys = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  const xScale = useMemo(() => scaleBand<number>({ domain: keys, range: [0, xMax], padding: 0.25 }), [keys, xMax]);
  const yScale = useMemo(() => {
    const values = data.flatMap((d) => [d.amount ?? 0, d.projectedAmount ?? 0]);
    return scaleLinear<number>({ domain: [Math.min(0, ...values), Math.max(1, ...values)], range: [yMax, 0], nice: true });
  }, [data, yMax]);
  const zero = yScale(0) ?? yMax;
  const roving = useRovingFocus(
    count,
    Math.max(
      0,
      data.findLastIndex((d) => d.amount !== null),
    ),
  );
  const barWidth = Math.min(marks.maxBar, xScale.bandwidth());
  const step = xScale.step();
  const every = Math.max(1, Math.round(data.length / 6));
  const last = data.length - 1;
  const tickValues = keys.filter((i) => i === last || (i % every === 0 && last - i >= every / 2));

  const show = (i: number) => {
    const d = data[i];
    const v = d.amount ?? d.projectedAmount ?? 0;
    const left = (xScale(i) ?? 0) + margin.left + xScale.bandwidth() / 2;
    showTooltip({ tooltipData: i, tooltipLeft: left, tooltipTop: (yScale(Math.max(0, v)) ?? 0) + margin.top });
  };
  const active = tooltipOpen && tooltipData !== undefined ? data[tooltipData] : null;
  /** A bar's accessible name: "5 Oct 2026: October €42.10, September €38.00". */
  const nameOf = (d: SpendingBarPoint) => {
    const value =
      d.amount !== null
        ? `${label} ${formatValue(d.amount)}`
        : d.projectedAmount !== null
          ? `expected ${formatValue(d.projectedAmount)}`
          : "nothing yet";
    const before = d.previousAmount !== null ? `, ${previousLabel} ${formatValue(d.previousAmount)}` : "";
    return `${d.title}: ${value}${before}`;
  };
  const focused = roving.ringVisible && roving.focused !== null ? roving.focused : null;

  return (
    <div className="relative" ref={containerRef}>
      {/* biome-ignore lint/a11y/useSemanticElements: an <svg> cannot be a <fieldset>; group names a chart of focusable marks */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={FLUID}
        role="group"
        aria-label={`${label} spending. Use the arrow keys to move between bars.`}
      >
        <Group left={margin.left} top={margin.top}>
          <GridRows scale={yScale} width={xMax} numTicks={4} stroke={tokens.grid} strokeWidth={1} />
          {active && tooltipData !== undefined && (
            <Bar
              x={(xScale(tooltipData) ?? 0) - (step - xScale.bandwidth()) / 2}
              y={0}
              width={step}
              height={yMax}
              rx={6}
              fill={tokens.grid}
              fillOpacity={0.45}
            />
          )}
          {data.map((d, i) => {
            const value = d.amount ?? d.projectedAmount;
            if (!value) return null;
            // Signed around zero: a refund-heavy day hangs below the line, rounded at its far end.
            const y = yScale(value) ?? 0;
            const below = value < 0;
            return (
              <BarRounded
                key={`b-${d.title}`}
                aria-hidden
                x={(xScale(i) ?? 0) + (xScale.bandwidth() - barWidth) / 2}
                y={below ? zero : y}
                width={barWidth}
                height={Math.abs(zero - y)}
                radius={marks.radius}
                top={!below}
                bottom={below}
                fill={BAR}
                fillOpacity={d.amount === null ? 0.3 : 1}
              />
            );
          })}
          {/* Hit targets: the whole band, full height. One roving tab stop. */}
          {keys.map((i) => (
            <Bar
              key={`hit-${data[i].title}`}
              innerRef={roving.ref(i)}
              x={(xScale(i) ?? 0) - (step - xScale.bandwidth()) / 2}
              y={0}
              width={step}
              height={yMax}
              fill="transparent"
              tabIndex={roving.tabIndex(i)}
              role="img"
              aria-label={nameOf(data[i])}
              onMouseMove={() => show(i)}
              onMouseLeave={hideTooltip}
              onFocus={(e) => {
                roving.onFocus(i, e);
                show(i);
              }}
              onBlur={(e) => roving.onBlur(e) && hideTooltip()}
              onKeyDown={(e) => (e.key === "Escape" ? hideTooltip() : roving.onKeyDown(i, e))}
              style={{ outline: "none" }}
            />
          ))}
          {/* Keyboard focus ring around the focused band: SVG marks get no native outline. */}
          {focused !== null && (
            <Bar
              aria-hidden
              x={(xScale(focused) ?? 0) - (step - xScale.bandwidth()) / 2 + 1}
              y={1}
              width={Math.max(0, step - 2)}
              height={Math.max(0, yMax - 2)}
              rx={6}
              {...focusRing}
            />
          )}
          <g aria-hidden>
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
          </g>
        </Group>
      </svg>
      {active && (
        <ChartTooltip Portal={TooltipInPortal} left={tooltipLeft} top={tooltipTop}>
          <TooltipRow label={active.title} value="" strong />
          <div className="my-1.5 h-px bg-[var(--grid)]" />
          {active.amount !== null ? (
            <TooltipRow color={1} label={label} value={formatValue(active.amount)} />
          ) : (
            active.projectedAmount !== null && <TooltipRow color={1} label="Expected" value={formatValue(active.projectedAmount)} />
          )}
          {active.previousAmount !== null && <TooltipRow color={null} label={previousLabel} value={formatValue(active.previousAmount)} />}
          {active.previousAmount !== null && (active.amount ?? active.projectedAmount) !== null && (
            <>
              <div className="my-1.5 h-px bg-[var(--grid)]" />
              <TooltipRow
                label="Difference"
                value={<Difference value={(active.amount ?? active.projectedAmount ?? 0) - active.previousAmount} format={formatValue} />}
              />
            </>
          )}
        </ChartTooltip>
      )}
    </div>
  );
}
