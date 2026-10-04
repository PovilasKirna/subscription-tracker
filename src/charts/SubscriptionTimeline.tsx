"use client";

import { AxisBottom } from "@visx/axis";
import { localPoint } from "@visx/event";
import { GridColumns } from "@visx/grid";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleBand, scaleUtc } from "@visx/scale";
import { Bar, Circle, Line } from "@visx/shape";
import { type MouseEvent, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartTooltip, TooltipRow, useChartTooltip } from "./ChartTooltip";
import { axisLabel, fitLabel, marks, slotColor, tokens } from "./palette";
import type { Accessor, TimelineCharge, TimelineRow, Today } from "./types";

const FLUID = { display: "block", width: "100%", height: "auto" } as const;

type Props<T extends TimelineRow> = {
  data: readonly T[];
  today: Today;
  formatMoney: (amount: number, currency: string) => string;
  formatDate: (d: string) => string;
  formatTick: (d: Date) => string;
};

type Hover<T extends TimelineRow> = { row: T; charge: TimelineCharge; change?: T["priceChanges"][number] };

const ROW = 30;
const margin = { top: 6, right: 30, bottom: 28 }; // right: room for the last tick label
const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const getKey: Accessor<TimelineRow, string> = (r) => r.key;
const getChargeDate: Accessor<TimelineCharge, Date> = (c) => toDate(c.date);

/** One row per subscription: a span from first to last charge, a tick per charge, a ringed marker per price change. */
export function SubscriptionTimeline<T extends TimelineRow>(props: Props<T>) {
  const height = margin.top + margin.bottom + props.data.length * ROW;
  return (
    <ParentSize initialSize={{ width: 560 }} style={{ height }} debounceTime={40}>
      {({ width }) => (width > 0 ? <Timeline {...props} width={width} height={height} /> : null)}
    </ParentSize>
  );
}

function Timeline<T extends TimelineRow>({
  data,
  today,
  formatMoney,
  formatDate,
  formatTick,
  width,
  height,
}: Props<T> & { width: number; height: number }) {
  const { tooltipOpen, tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip, containerRef, TooltipInPortal } =
    useChartTooltip<Hover<T>>();
  const labelWidth = width < 520 ? 104 : 150;
  const maxChars = width < 520 ? 13 : 20;
  const xMax = Math.max(0, width - labelWidth - margin.right);
  const yMax = Math.max(0, height - margin.top - margin.bottom);

  const xScale = useMemo(() => {
    const first = data.reduce((min, r) => (r.firstCharge < min ? r.firstCharge : min), today);
    return scaleUtc<number>({ domain: [toDate(first), toDate(today)], range: [0, xMax] });
  }, [data, today, xMax]);
  const yScale = useMemo(() => scaleBand<string>({ domain: data.map(getKey), range: [0, yMax], padding: 0 }), [data, yMax]);
  const numTicks = Math.max(2, Math.floor(xMax / 90));

  const onMove = (row: T, e: MouseEvent<SVGRectElement>) => {
    const p = localPoint(e);
    if (!p) return;
    const x = xScale.invert(p.x - labelWidth).getTime();
    let charge = row.charges[0];
    for (const c of row.charges) if (Math.abs(getChargeDate(c).getTime() - x) < Math.abs(getChargeDate(charge).getTime() - x)) charge = c;
    showTooltip({
      tooltipData: { row, charge, change: row.priceChanges.find((pc) => pc.date === charge.date) },
      tooltipLeft: p.x,
      tooltipTop: p.y,
    });
  };

  return (
    <div className="relative" ref={containerRef}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={FLUID} role="img" aria-label="Subscription timeline">
        <Group left={labelWidth} top={margin.top}>
          <GridColumns scale={xScale} height={yMax} numTicks={numTicks} stroke={tokens.grid} strokeWidth={1} />
          {data.map((row) => {
            const y = (yScale(row.key) ?? 0) + yScale.bandwidth() / 2;
            const color = slotColor(row.colorSlot);
            const faded = row.status === "inactive" || row.status === "cancelled";
            const hovered = tooltipOpen && tooltipData?.row.key === row.key;
            return (
              <Group key={row.key} opacity={faded && !hovered ? 0.45 : 1}>
                <text
                  x={-12}
                  y={y}
                  dy="0.32em"
                  textAnchor="end"
                  fontSize={12}
                  fill={hovered ? tokens.textPrimary : tokens.textSecondary}
                  fontWeight={hovered ? 600 : 400}
                >
                  {fitLabel(row.name, maxChars)}
                </text>
                <Line
                  from={{ x: xScale(toDate(row.firstCharge)), y }}
                  to={{ x: xScale(toDate(row.lastCharge)), y }}
                  stroke={color}
                  strokeWidth={marks.line}
                  strokeLinecap="round"
                />
                {row.charges.map((c) => {
                  const x = xScale(getChargeDate(c));
                  return (
                    <Line
                      key={c.date}
                      from={{ x, y: y - 5 }}
                      to={{ x, y: y + 5 }}
                      stroke={color}
                      strokeWidth={marks.line}
                      strokeLinecap="round"
                    />
                  );
                })}
                {row.priceChanges.map((pc) => (
                  <Circle
                    key={pc.date}
                    cx={xScale(toDate(pc.date))}
                    cy={y}
                    r={marks.markerR + 1}
                    fill={color}
                    stroke={tokens.surface}
                    strokeWidth={marks.ring}
                  />
                ))}
                {/* Row-wide hit target. */}
                <Bar
                  x={-labelWidth}
                  y={y - ROW / 2}
                  width={xMax + labelWidth}
                  height={ROW}
                  fill="transparent"
                  onMouseMove={(e) => onMove(row, e)}
                  onMouseLeave={hideTooltip}
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
            tickFormat={(d) => formatTick(d as Date)}
            tickLabelProps={() => ({ ...axisLabel, textAnchor: "middle", dy: 4 })}
          />
        </Group>
      </svg>
      {tooltipOpen && tooltipData && (
        <ChartTooltip Portal={TooltipInPortal} left={tooltipLeft} top={tooltipTop}>
          <TooltipRow slot={tooltipData.row.colorSlot} label={tooltipData.row.name} value="" strong />
          <TooltipRow
            label={formatDate(tooltipData.charge.date)}
            value={formatMoney(tooltipData.charge.amount, tooltipData.row.currency)}
          />
          {tooltipData.change && (
            <TooltipRow
              label="Price change"
              value={`${formatMoney(tooltipData.change.from, tooltipData.row.currency)} → ${formatMoney(tooltipData.change.to, tooltipData.row.currency)}`}
            />
          )}
          <div className="mt-1 text-[11.5px] text-[var(--text-muted)]">
            {tooltipData.row.charges.length} charges · since {formatDate(tooltipData.row.firstCharge)}
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}

export function SubscriptionTimelineTable<T extends TimelineRow>({
  data,
  formatMoney,
  formatDate,
}: Pick<Props<T>, "data" | "formatMoney" | "formatDate">) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Subscription</TableHead>
          <TableHead>First charge</TableHead>
          <TableHead>Last charge</TableHead>
          <TableHead className="text-right">Charges</TableHead>
          <TableHead>Price changes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((r) => (
          <TableRow key={r.key}>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell>{formatDate(r.firstCharge)}</TableCell>
            <TableCell>{formatDate(r.lastCharge)}</TableCell>
            <TableCell className="tabular text-right">{r.charges.length}</TableCell>
            <TableCell className="text-[var(--text-secondary)]">
              {r.priceChanges.length
                ? r.priceChanges
                    .map((pc) => `${formatDate(pc.date)}: ${formatMoney(pc.from, r.currency)} → ${formatMoney(pc.to, r.currency)}`)
                    .join("; ")
                : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
