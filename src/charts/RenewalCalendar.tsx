"use client";

import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleBand } from "@visx/scale";
import { Bar } from "@visx/shape";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { MerchantIcon } from "@/components/MerchantIcon";
import { cn } from "@/lib/utils";
import { ChartTooltip, TooltipRow, useChartTooltip, useRovingFocus } from "./ChartTooltip";
import { focusRing, MIN_TEXT, tokens } from "./palette";
import { dayLogoLayout, logoX } from "./renewalLayout";
import type { Accessor, ExpectedCharge, Today } from "./types";

const FLUID = { display: "block", width: "100%", height: "auto" } as const;

type Props = {
  charges: readonly ExpectedCharge[];
  today: Today;
  /** YYYY-MM: the calendar month to show. Days before `today` are dimmed. */
  month: string;
  /** Amount shown inside a day cell (may be rounded). */
  formatMoney: (amount: number, currency: string) => string;
  /**
   * Exact amount, with cents, for the tooltip and each day's accessible name.
   * Optional: falls back to `formatMoney`.
   */
  formatAmount?: (amount: number, currency: string) => string;
  formatDate: (d: string) => string;
};

type Cell = { date: string; day: number; col: number; row: number; inWindow: boolean; charges: ExpectedCharge[] };

const HEADER = 22;
const CELL_H = 54;
const CELL_GAP = 6;
/** Gap between a day's logo row and the bottom of its cell. */
const LOGO_BOTTOM = 6;
/** MerchantIcon sizes below its smallest preset, keyed by `logoSize`. */
const LOGO_CLASS: Record<number, string | undefined> = { 16: "size-4 rounded-[4px] text-[7px]", 14: "size-3.5 rounded-[3px] text-[6px]" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY = 86_400_000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);
const getDate: Accessor<ExpectedCharge, string> = (c) => c.date;

function buildCells(charges: readonly ExpectedCharge[], today: string, month: string): Cell[] {
  const first = toTime(`${month}-01`);
  const d = new Date(first);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const start = Math.max(first, toTime(today));
  const weekday = (d.getUTCDay() + 6) % 7; // Monday = 0
  const gridStart = first - weekday * DAY;
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

/** One calendar month as a week grid, each expected charge placed on its date. */
export function RenewalCalendar(props: Props) {
  const cells = useMemo(() => buildCells(props.charges, props.today, props.month), [props.charges, props.today, props.month]);
  const rows = (cells.at(-1)?.row ?? 0) + 1;
  const height = HEADER + rows * (CELL_H + CELL_GAP);
  return (
    <ParentSize initialSize={{ width: 345 }} debounceTime={40} style={{ height }}>
      {({ width }) => (width > 0 ? <Calendar {...props} cells={cells} rows={rows} width={width} /> : null)}
    </ParentSize>
  );
}

function Calendar({
  cells,
  rows,
  today,
  formatMoney,
  formatAmount,
  formatDate,
  width,
}: Props & { cells: Cell[]; rows: number; width: number }) {
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
  const exact = formatAmount ?? formatMoney;

  // The marks: days still to come in this month that have a charge, in date order. One roving tab stop.
  const marked = useMemo(() => cells.filter((c) => c.inWindow && c.charges.length > 0), [cells]);
  const roving = useRovingFocus(marked.length, 0);
  const show = (c: Cell) =>
    showTooltip({ tooltipData: c, tooltipLeft: (xScale(c.col) ?? 0) + cellW / 2, tooltipTop: (yScale(c.row) ?? 0) + cellH / 2 });

  // A tap (or click) pins the tooltip until the next tap anywhere outside the marked days.
  const [pinned, setPinned] = useState<string | null>(null);
  const pinnedCell = pinned ? marked.find((c) => c.date === pinned) : undefined;
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest("[data-renewal-day]")) return;
      setPinned(null);
      hideTooltip();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [pinned, hideTooltip]);

  /** Date, then every charge with its exact amount: everything the tooltip shows. */
  const dayLabel = (c: Cell) => `${formatDate(c.date)}: ${c.charges.map((ch) => `${ch.name} ${exact(ch.amount, ch.currency)}`).join(", ")}`;

  const onKeyDown = (i: number, e: KeyboardEvent<SVGRectElement>) => {
    if (e.key === "Escape") {
      setPinned(null);
      hideTooltip();
      return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      // Up / Down jump a week: to the nearest renewal day at least 7 days away (or the first / last one).
      e.preventDefault();
      const down = e.key === "ArrowDown";
      const target = toTime(marked[i].date) + (down ? 7 : -7) * DAY;
      let j = down ? marked.length - 1 : 0;
      if (down) {
        const k = marked.findIndex((c) => toTime(c.date) >= target);
        if (k !== -1) j = k;
      } else {
        for (let k = marked.length - 1; k >= 0; k--)
          if (toTime(marked[k].date) <= target) {
            j = k;
            break;
          }
      }
      roving.focusIndex(j);
      return;
    }
    roving.onKeyDown(i, e, { prev: ["ArrowLeft"], next: ["ArrowRight"] });
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* biome-ignore lint/a11y/useSemanticElements: an <svg> cannot be a <fieldset>; group names a chart of focusable marks */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={FLUID}
        role="group"
        aria-label={
          marked.length
            ? "Upcoming renewals calendar. Use the arrow keys to move between renewal days."
            : "Upcoming renewals calendar: no renewals to show."
        }
      >
        <g aria-hidden>
          {WEEKDAYS.map((d, i) => (
            <text key={d} x={(xScale(i) ?? 0) + 8} y={14} fontSize={MIN_TEXT} fill={tokens.textMuted}>
              {cellW < 44 ? d[0] : d}
            </text>
          ))}
        </g>
        {cells.map((c) => {
          const x = xScale(c.col) ?? 0;
          const y = yScale(c.row) ?? 0;
          const isToday = c.date === today;
          const total = c.charges.reduce((s, ch) => s + ch.amount, 0);
          const active = tooltipOpen && tooltipData?.date === c.date;
          const i = marked.indexOf(c);
          const logos = dayLogoLayout(cellW, c.charges.length);
          // Days outside the window fade their cell and logos; the day number stays at 3:1+ (Ash, not opacity).
          const fade = c.inWindow ? 1 : 0.35;
          return (
            <Group key={c.date} left={x} top={y}>
              <g aria-hidden>
                <Bar
                  width={cellW}
                  height={cellH}
                  rx={8}
                  fill={active ? tokens.grid : tokens.surface}
                  fillOpacity={active ? 0.5 : 1}
                  stroke={isToday ? tokens.textSecondary : tokens.grid}
                  strokeWidth={1}
                  opacity={fade}
                />
                <text
                  x={8}
                  y={16}
                  fontSize={MIN_TEXT}
                  fontWeight={isToday ? 700 : 400}
                  fill={isToday ? tokens.textPrimary : c.inWindow ? tokens.textSecondary : tokens.textMuted}
                >
                  {c.day}
                </text>
                {showAmounts && total > 0 && (
                  <text
                    x={cellW - 8}
                    y={16}
                    textAnchor="end"
                    fontSize={MIN_TEXT}
                    fill={tokens.textSecondary}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {formatMoney(total, c.charges[0].currency)}
                  </text>
                )}
                {/* The logos themselves are HTML, laid over the grid below; "+k" counts the rest. */}
                {logos.more > 0 && (
                  <text
                    x={logoX(logos.size, logos.shown)}
                    y={cellH - LOGO_BOTTOM - logos.size / 2}
                    dominantBaseline="central"
                    fontSize={MIN_TEXT}
                    fill={tokens.textMuted}
                    opacity={fade}
                  >
                    +{logos.more}
                  </text>
                )}
              </g>
              {/* Hit target: the whole cell. */}
              {i !== -1 && (
                <Bar
                  innerRef={roving.ref(i)}
                  data-renewal-day=""
                  width={cellW}
                  height={cellH}
                  fill="transparent"
                  tabIndex={roving.tabIndex(i)}
                  role="img"
                  aria-label={dayLabel(c)}
                  onPointerEnter={(e) => e.pointerType === "mouse" && show(c)}
                  onPointerLeave={(e) => {
                    if (e.pointerType !== "mouse") return;
                    if (pinnedCell) show(pinnedCell);
                    else hideTooltip();
                  }}
                  onClick={() => {
                    setPinned(c.date);
                    show(c);
                  }}
                  onFocus={(e) => {
                    roving.onFocus(i, e);
                    show(c);
                  }}
                  onBlur={(e) => {
                    if (!roving.onBlur(e)) return;
                    setPinned(null);
                    hideTooltip();
                  }}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  style={{ outline: "none", cursor: "default" }}
                />
              )}
              {/* Keyboard focus ring: SVG marks get no native outline. */}
              {i !== -1 && roving.ringVisible && roving.focused === i && (
                <Bar aria-hidden x={1} y={1} width={Math.max(0, cellW - 2)} height={cellH - 2} rx={7} {...focusRing} />
              )}
            </Group>
          );
        })}
      </svg>
      {/* The logos: MerchantIcon is HTML, laid over the SVG (drawn 1:1); pointers pass through to the hit targets. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {cells.map((c) => {
          if (!c.charges.length) return null;
          const logos = dayLogoLayout(cellW, c.charges.length);
          const top = (yScale(c.row) ?? 0) + cellH - LOGO_BOTTOM - logos.size;
          return c.charges
            .slice(0, logos.shown)
            .map((ch, k) => (
              <MerchantIcon
                key={`${c.date}:${ch.key}`}
                name={ch.name}
                website={ch.website}
                size="sm"
                className={cn("absolute", LOGO_CLASS[logos.size], !c.inWindow && "opacity-35")}
                style={{ left: (xScale(c.col) ?? 0) + logoX(logos.size, k), top }}
              />
            ));
        })}
      </div>
      {tooltipOpen && tooltipData && (
        <ChartTooltip Portal={TooltipInPortal} left={tooltipLeft} top={tooltipTop}>
          <div className="mb-1 font-medium">{formatDate(tooltipData.date)}</div>
          {tooltipData.charges.map((ch) => (
            <TooltipRow key={ch.key} color={ch.color} label={ch.name} value={exact(ch.amount, ch.currency)} />
          ))}
        </ChartTooltip>
      )}
    </div>
  );
}
