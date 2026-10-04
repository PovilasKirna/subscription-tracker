"use client";

import { AxisBottom } from "@visx/axis";
import { GridColumns } from "@visx/grid";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar, BarRounded } from "@visx/shape";
import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartTooltip, TooltipRow, useChartTooltip } from "./ChartTooltip";
import { axisLabel, fitLabel, marks, seriesColor, tokens } from "./palette";
import type { Accessor } from "./types";

const FLUID = { display: "block", width: "100%", height: "auto" } as const;

type Props<T> = {
  data: readonly T[];
  getKey: Accessor<T, string>;
  getLabel: Accessor<T, string>;
  getValue: Accessor<T, number>;
  formatValue: (n: number) => string;
  formatAxisValue: (n: number) => string;
};

const ROW = 30;
const BAR = 16; // <= 24px thick
const margin = { top: 0, right: 72, bottom: 24 };

/** Horizontal bars, sorted descending, one colour (slot 1). */
export function SpendByMerchant<T>(props: Props<T>) {
  const sorted = useMemo(() => [...props.data].sort((a, b) => props.getValue(b) - props.getValue(a)), [props]);
  const height = margin.top + margin.bottom + sorted.length * ROW;
  return (
    <ParentSize initialSize={{ width: 345 }} style={{ height }} debounceTime={40}>
      {({ width }) => (width > 0 ? <Bars {...props} data={sorted} width={width} height={height} /> : null)}
    </ParentSize>
  );
}

function Bars<T>({
  data,
  getKey,
  getLabel,
  getValue,
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
                {/* Square at the baseline, 4px rounded data-end. */}
                <BarRounded
                  x={0}
                  y={y}
                  width={w}
                  height={BAR}
                  radius={marks.radius}
                  right
                  fill={seriesColor(1)}
                  opacity={tooltipOpen && !active ? 0.6 : 1}
                />
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
                  aria-label={`${label}: ${formatValue(getValue(d))}`}
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
          <TooltipRow color={1} label={getLabel(tooltipData)} value={formatValue(getValue(tooltipData))} strong />
          <div className="mt-1 text-[11.5px] text-[var(--text-muted)]">
            {total > 0 ? `${Math.round((getValue(tooltipData) / total) * 100)}% of subscription spend` : ""}
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}

export function SpendByMerchantTable<T>({ data, getKey, getLabel, getValue, formatValue }: Omit<Props<T>, "formatAxisValue">) {
  const total = data.reduce((s, d) => s + getValue(d), 0);
  const sorted = [...data].sort((a, b) => getValue(b) - getValue(a));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Merchant</TableHead>
          <TableHead className="text-right">Spent</TableHead>
          <TableHead className="text-right">Share</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((d) => (
          <TableRow key={getKey(d)}>
            <TableCell className="font-medium">{getLabel(d)}</TableCell>
            <TableCell className="tabular text-right">{formatValue(getValue(d))}</TableCell>
            <TableCell className="tabular text-right">{total ? `${Math.round((getValue(d) / total) * 100)}%` : "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
