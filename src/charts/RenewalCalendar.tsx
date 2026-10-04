"use client";

import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleBand } from "@visx/scale";
import { Bar, Circle } from "@visx/shape";
import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartTooltip, TooltipRow, useChartTooltip } from "./ChartTooltip";
import { marks, seriesColor, tokens } from "./palette";
import type { Accessor, ExpectedCharge, Today } from "./types";

const FLUID = { display: "block", width: "100%", height: "auto" } as const;

type Props = {
  charges: readonly ExpectedCharge[];
  today: Today;
  days: number;
  formatMoney: (amount: number, currency: string) => string;
  formatDate: (d: string) => string;
};

type Cell = { date: string; day: number; col: number; row: number; inWindow: boolean; charges: ExpectedCharge[] };

const HEADER = 22;
const CELL_H = 54;
const CELL_GAP = 6;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY = 86_400_000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);
const getDate: Accessor<ExpectedCharge, string> = (c) => c.date;

function buildCells(charges: readonly ExpectedCharge[], today: string, days: number): Cell[] {
  const start = toTime(today);
  const end = start + days * DAY;
  const weekday = (new Date(start).getUTCDay() + 6) % 7; // Monday = 0
  const gridStart = start - weekday * DAY;
  const byDate = new Map<string, ExpectedCharge[]>();
  for (const c of charges) byDate.set(getDate(c), [...(byDate.get(getDate(c)) ?? []), c]);
  const cells: Cell[] = [];
  for (let t = gridStart, i = 0; t < end || i % 7 !== 0; t += DAY, i++) {
    const date = toIso(t);
    cells.push({
      date,
      day: new Date(t).getUTCDate(),
      col: i % 7,
      row: Math.floor(i / 7),
      inWindow: t >= start && t < end,
      charges: byDate.get(date) ?? [],
    });
  }
  return cells;
}

/** The next N days as a week grid, each expected charge placed on its date. */
export function RenewalCalendar(props: Props) {
  const cells = useMemo(() => buildCells(props.charges, props.today, props.days), [props.charges, props.today, props.days]);
  const rows = (cells.at(-1)?.row ?? 0) + 1;
  const height = HEADER + rows * (CELL_H + CELL_GAP);
  return (
    <ParentSize initialSize={{ width: 345 }} debounceTime={40} style={{ height }}>
      {({ width }) => (width > 0 ? <Calendar {...props} cells={cells} rows={rows} width={width} /> : null)}
    </ParentSize>
  );
}

function Calendar({ cells, rows, today, formatMoney, formatDate, width }: Props & { cells: Cell[]; rows: number; width: number }) {
  const { tooltipOpen, tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip, containerRef, TooltipInPortal } =
    useChartTooltip<Cell>();
  const xScale = useMemo(() => scaleBand<number>({ domain: [0, 1, 2, 3, 4, 5, 6], range: [0, width], paddingInner: 0.08 }), [width]);
  const cellW = xScale.bandwidth();
  const cellH = CELL_H;
  const height = HEADER + rows * (CELL_H + CELL_GAP);
  const yScale = useMemo(
    () =>
      scaleBand<number>({
        domain: Array.from({ length: rows }, (_, i) => i),
        range: [HEADER, height],
        paddingInner: CELL_GAP / (CELL_H + CELL_GAP),
      }),
    [rows, height],
  );
  const showAmounts = cellW >= 70;
  const maxDots = Math.max(1, Math.floor((cellW - 12) / 12));

  return (
    <div className="relative" ref={containerRef}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={FLUID}
        role="img"
        aria-label="Upcoming renewals calendar"
      >
        {WEEKDAYS.map((d, i) => (
          <text key={d} x={(xScale(i) ?? 0) + 8} y={14} fontSize={11} fill={tokens.textMuted}>
            {cellW < 44 ? d[0] : d}
          </text>
        ))}
        {cells.map((c) => {
          const x = xScale(c.col) ?? 0;
          const y = yScale(c.row) ?? 0;
          const isToday = c.date === today;
          const total = c.charges.reduce((s, ch) => s + ch.amount, 0);
          const active = tooltipOpen && tooltipData?.date === c.date;
          return (
            <Group key={c.date} left={x} top={y} opacity={c.inWindow ? 1 : 0.35}>
              <Bar
                width={cellW}
                height={cellH}
                rx={8}
                fill={active ? tokens.grid : tokens.surface}
                fillOpacity={active ? 0.5 : 1}
                stroke={isToday ? tokens.textSecondary : tokens.grid}
                strokeWidth={1}
              />
              <text x={8} y={16} fontSize={11.5} fontWeight={isToday ? 700 : 400} fill={isToday ? tokens.textPrimary : tokens.textMuted}>
                {c.day}
              </text>
              {showAmounts && total > 0 && (
                <text
                  x={cellW - 8}
                  y={16}
                  textAnchor="end"
                  fontSize={11}
                  fill={tokens.textSecondary}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatMoney(total, c.charges[0].currency)}
                </text>
              )}
              {c.charges.slice(0, maxDots).map((ch, i) => (
                <Circle
                  key={ch.key}
                  cx={12 + i * 12}
                  cy={cellH - 13}
                  r={marks.markerR}
                  fill={seriesColor(ch.color)}
                  stroke={tokens.surface}
                  strokeWidth={marks.ring}
                />
              ))}
              {c.charges.length > maxDots && (
                <text x={12 + maxDots * 12} y={cellH - 9} fontSize={10.5} fill={tokens.textMuted}>
                  +{c.charges.length - maxDots}
                </text>
              )}
              {/* Hit target: the whole cell. */}
              {c.inWindow && c.charges.length > 0 && (
                <Bar
                  width={cellW}
                  height={cellH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${formatDate(c.date)}: ${c.charges.map((ch) => ch.name).join(", ")}`}
                  onMouseEnter={() => showTooltip({ tooltipData: c, tooltipLeft: x + cellW / 2, tooltipTop: y + cellH / 2 })}
                  onMouseLeave={hideTooltip}
                  onFocus={() => showTooltip({ tooltipData: c, tooltipLeft: x + cellW / 2, tooltipTop: y + cellH / 2 })}
                  onBlur={hideTooltip}
                  style={{ outline: "none", cursor: "default" }}
                />
              )}
            </Group>
          );
        })}
      </svg>
      {tooltipOpen && tooltipData && (
        <ChartTooltip Portal={TooltipInPortal} left={tooltipLeft} top={tooltipTop}>
          <div className="mb-1 font-medium">{formatDate(tooltipData.date)}</div>
          {tooltipData.charges.map((ch) => (
            <TooltipRow key={ch.key} color={ch.color} label={ch.name} value={formatMoney(ch.amount, ch.currency)} />
          ))}
        </ChartTooltip>
      )}
    </div>
  );
}

export function RenewalCalendarTable({ charges, formatMoney, formatDate }: Pick<Props, "charges" | "formatMoney" | "formatDate">) {
  if (!charges.length) return <p className="py-6 text-center text-sm text-[var(--text-secondary)]">No charges expected in this window.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Subscription</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {charges.map((c) => (
          <TableRow key={`${c.key}-${c.date}`}>
            <TableCell>{formatDate(c.date)}</TableCell>
            <TableCell className="font-medium">{c.name}</TableCell>
            <TableCell className="tabular text-right">{formatMoney(c.amount, c.currency)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
