"use client";

import { AxisBottom } from "@visx/axis";
import { GridColumns } from "@visx/grid";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar, BarRounded } from "@visx/shape";
import { useMemo } from "react";
import { ChartTooltip, TooltipRow, useChartTooltip } from "./ChartTooltip";
import { Legend } from "./Legend";
import { axisLabel, fitLabel, marks, seriesColor, tokens } from "./palette";
import type { Accessor } from "./types";

const FLUID = { display: "block", width: "100%", height: "auto" } as const;

type Props<T> = {
  data: readonly T[];
  getKey: Accessor<T, string>;
  getLabel: Accessor<T, string>;
  /** Everything spent; sets the bar length and the order. */
  getValue: Accessor<T, number>;
  /** The part of the value someone else paid back, drawn as a lighter end segment. */
  getSubsidised: Accessor<T, number>;
  formatValue: (n: number) => string;
  formatAxisValue: (n: number) => string;
};

const ROW = 30;
const BAR = 16; // <= 24px thick
const margin = { top: 0, right: 72, bottom: 24 };

const PAID = seriesColor(1);
/** Same hue, washed towards the card surface, so "covered by someone else" reads as part of the bar. */
const SUBSIDISED = "color-mix(in oklab, var(--series-1) 35%, var(--surface-1))";
const LEGEND = [
  { key: "paid", label: "Paid by me", color: PAID },
  { key: "subsidised", label: "Subsidised", color: SUBSIDISED },
];

/** Horizontal bars, sorted descending: what you paid (slot 1), then what was paid back (lighter). */
export function SpendByMerchant<T>(props: Props<T>) {
  const sorted = useMemo(() => [...props.data].sort((a, b) => props.getValue(b) - props.getValue(a)), [props]);
  const anySubsidised = sorted.some((d) => props.getSubsidised(d) > 0);
  const height = margin.top + margin.bottom + sorted.length * ROW;
  return (
    <div>
      {anySubsidised && <Legend items={LEGEND} />}
      <ParentSize initialSize={{ width: 345 }} style={{ height }} debounceTime={40}>
        {({ width }) => (width > 0 ? <Bars {...props} data={sorted} width={width} height={height} /> : null)}
      </ParentSize>
    </div>
  );
}

function Bars<T>({
  data,
  getKey,
  getLabel,
  getValue,
  getSubsidised,
  formatValue,
  formatAxisValue,
  width,
  height,
}: Props<T> & { width: number; height: number }) {
  const { tooltipOpen, tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip, containerRef, TooltipInPortal } =
    useChartTooltip<T>();
  const labelWidth = width < 420 ? 96 : 130;
  const maxChars = width < 420 ? 12 : 18;
  const xMax = Math.max(0, width - labelWidth - margin.right);
  const yMax = Math.max(0, height - margin.top - margin.bottom);
  const total = data.reduce((s, d) => s + getValue(d), 0);

  const xScale = useMemo(
    () => scaleLinear<number>({ domain: [0, Math.max(1, ...data.map(getValue))], range: [0, xMax], nice: true }),
    [data, getValue, xMax],
  );
  const yScale = useMemo(() => scaleBand<string>({ domain: data.map(getKey), range: [0, yMax] }), [data, getKey, yMax]);
  const numTicks = Math.max(2, Math.floor(xMax / 80));

  return (
    <div className="relative" ref={containerRef}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={FLUID} role="img" aria-label="Spend by merchant">
        <Group left={labelWidth} top={margin.top}>
          <GridColumns scale={xScale} height={yMax} numTicks={numTicks} stroke={tokens.grid} strokeWidth={1} />
          {data.map((d) => {
            const key = getKey(d);
            const y = (yScale(key) ?? 0) + (yScale.bandwidth() - BAR) / 2;
            const w = Math.max(2, xScale(getValue(d)));
            const sub = Math.min(getSubsidised(d), getValue(d));
            // Paid segment from the baseline; the subsidised one carries the rounded data-end.
            const paidW = sub > 0 ? Math.max(0, xScale(getValue(d) - sub) - marks.gap) : w;
            const subX = sub > 0 ? Math.min(w - 2, xScale(getValue(d) - sub)) : w;
            const label = getLabel(d);
            const active = tooltipOpen && tooltipData !== undefined && getKey(tooltipData) === key;
            const show = () => showTooltip({ tooltipData: d, tooltipLeft: labelWidth + w, tooltipTop: y });
            return (
              <Group key={key}>
                <text
                  x={-12}
                  y={y + BAR / 2}
                  dy="0.32em"
                  textAnchor="end"
                  fontSize={12}
                  fill={active ? tokens.textPrimary : tokens.textSecondary}
                >
                  {fitLabel(label, maxChars)}
                </text>
                {/* Square at the baseline, 4px rounded data-end, 2px surface gap between segments. */}
                <Group opacity={tooltipOpen && !active ? 0.6 : 1}>
                  {sub > 0 ? (
                    <>
                      {paidW > 0.5 && <Bar x={0} y={y} width={paidW} height={BAR} fill={PAID} />}
                      <BarRounded x={subX} y={y} width={w - subX} height={BAR} radius={marks.radius} right fill={SUBSIDISED} />
                    </>
                  ) : (
                    <BarRounded x={0} y={y} width={w} height={BAR} radius={marks.radius} right fill={PAID} />
                  )}
                </Group>
                <text
                  x={w + 6}
                  y={y + BAR / 2}
                  dy="0.32em"
                  fontSize={11.5}
                  fill={tokens.textSecondary}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatValue(getValue(d))}
                </text>
                <Bar
                  x={-labelWidth}
                  y={yScale(key) ?? 0}
                  width={labelWidth + xMax + margin.right}
                  height={ROW}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${label}: ${formatValue(getValue(d))}${sub > 0 ? `, ${formatValue(sub)} subsidised` : ""}`}
                  onMouseEnter={show}
                  onMouseLeave={hideTooltip}
                  onFocus={show}
                  onBlur={hideTooltip}
                  style={{ outline: "none" }}
                />
              </Group>
            );
          })}
          <AxisBottom
            top={yMax}
            scale={xScale}
            numTicks={numTicks}
            stroke={tokens.axis}
            hideTicks
            tickFormat={(v) => formatAxisValue(Number(v))}
            tickLabelProps={() => ({ ...axisLabel, textAnchor: "middle", dy: 2 })}
          />
        </Group>
      </svg>
      {tooltipOpen && tooltipData !== undefined && (
        <ChartTooltip Portal={TooltipInPortal} left={tooltipLeft} top={tooltipTop}>
          <TooltipRow label={getLabel(tooltipData)} value={formatValue(getValue(tooltipData))} strong />
          {getSubsidised(tooltipData) > 0 && (
            <>
              <div className="my-1.5 h-px bg-[var(--grid)]" />
              <TooltipRow color={PAID} label="Paid by me" value={formatValue(getValue(tooltipData) - getSubsidised(tooltipData))} />
              <TooltipRow color={SUBSIDISED} label="Subsidised" value={formatValue(getSubsidised(tooltipData))} />
            </>
          )}
          <div className="mt-1 text-[11.5px] text-[var(--text-muted)]">
            {total > 0 ? `${Math.round((getValue(tooltipData) / total) * 100)}% of subscription spend` : ""}
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}
