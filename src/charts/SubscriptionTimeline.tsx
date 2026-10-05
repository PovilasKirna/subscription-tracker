"use client";

import { AxisBottom } from "@visx/axis";
import { localPoint } from "@visx/event";
import { GridColumns } from "@visx/grid";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleBand, scaleUtc } from "@visx/scale";
import { Bar, Circle, Line } from "@visx/shape";
import { type KeyboardEvent, type MouseEvent, useMemo, useState } from "react";
import { ChartTooltip, TooltipRow, useChartTooltip, useRovingFocus } from "./ChartTooltip";
import { axisLabel, fitLabel, focusRing, isOther, MIN_TEXT, marks, otherOutline, seriesColor, tokens } from "./palette";
import type { Accessor, TimelineCharge, TimelineRow, Today } from "./types";

const FLUID = { display: "block", width: "100%", height: "auto" } as const;

type Props<T extends TimelineRow> = {
  data: readonly T[];
  today: Today;
  formatMoney: (amount: number, currency: string) => string;
  formatDate: (d: string) => string;
  formatTick: (d: Date) => string;
  /**
   * Optional: called with a row's key on click, Enter or Space. When set, rows are exposed as
   * buttons; without it they are read-only images with an accessible name.
   */
  onSelect?: (key: string) => void;
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
  onSelect,
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
  // Keyboard: the chart is one tab stop. Up / Down move between rows (Ctrl+Home / Ctrl+End to the
  // first / last), Left / Right (and Home / End) step through the focused row's charges.
  const roving = useRovingFocus(data.length, 0);
  const focusedKey = roving.focused !== null ? (data[roving.focused]?.key ?? null) : null;
  // The live region only speaks for charge steps; landing on a row already reads the row's name.
  const [stepping, setStepping] = useState(false);
  const rowY = (row: T) => (yScale(row.key) ?? 0) + yScale.bandwidth() / 2;

  const showCharge = (row: T, index: number) => {
    const charge = row.charges[Math.min(Math.max(index, 0), row.charges.length - 1)];
    if (!charge) return;
    showTooltip({
      tooltipData: { row, charge, change: row.priceChanges.find((pc) => pc.date === charge.date) },
      tooltipLeft: labelWidth + xScale(getChargeDate(charge)),
      tooltipTop: margin.top + rowY(row),
    });
  };

  const onKeyDown = (row: T, i: number, e: KeyboardEvent<SVGRectElement>) => {
    if (e.key === "Escape") {
      hideTooltip();
      return;
    }
    if (onSelect && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onSelect(row.key);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "Home" || e.key === "End")) {
      e.preventDefault();
      roving.focusIndex(e.key === "Home" ? 0 : data.length - 1);
      return;
    }
    const current = tooltipData?.row.key === row.key ? row.charges.indexOf(tooltipData.charge) : row.charges.length - 1;
    const next =
      e.key === "ArrowLeft"
        ? current - 1
        : e.key === "ArrowRight"
          ? current + 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? row.charges.length - 1
              : null;
    if (next !== null) {
      e.preventDefault();
      setStepping(true);
      showCharge(row, next);
      return;
    }
    roving.onKeyDown(i, e, { prev: ["ArrowUp"], next: ["ArrowDown"] });
  };

  /** Everything the tooltip and marks show, as one sentence for screen readers. */
  const rowLabel = (row: T) => {
    const latest = row.charges.at(-1);
    const changes = row.priceChanges.map(
      (pc) => `${formatMoney(pc.from, row.currency)} to ${formatMoney(pc.to, row.currency)} on ${formatDate(pc.date)}`,
    );
    return [
      `${row.name}: ${row.charges.length} charges from ${formatDate(row.firstCharge)} to ${formatDate(row.lastCharge)}`,
      latest && `latest ${formatMoney(latest.amount, row.currency)}`,
      changes.length && `price changes: ${changes.join("; ")}`,
    ]
      .filter(Boolean)
      .join(", ");
  };

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
      {/* biome-ignore lint/a11y/useSemanticElements: an <svg> cannot be a <fieldset>; group names a chart of focusable marks */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={FLUID}
        role="group"
        aria-label="Subscription timeline. Up and down arrows move between subscriptions; left and right arrows step through charges."
      >
        <Group left={labelWidth} top={margin.top}>
          <g aria-hidden>
            <GridColumns scale={xScale} height={yMax} numTicks={numTicks} stroke={tokens.grid} strokeWidth={1} />
          </g>
          {data.map((row, i) => {
            const y = rowY(row);
            const color = seriesColor(row.color);
            const other = isOther(row.color);
            const faded = row.status === "inactive" || row.status === "cancelled";
            const hovered = tooltipOpen && tooltipData?.row.key === row.key;
            return (
              <Group key={row.key}>
                {/* Faded rows dim their marks only; the label keeps text contrast (Ash, not opacity). */}
                <text
                  aria-hidden
                  x={-12}
                  y={y}
                  dy="0.32em"
                  textAnchor="end"
                  fontSize={MIN_TEXT}
                  fill={hovered ? tokens.textPrimary : faded ? tokens.textMuted : tokens.textSecondary}
                  fontWeight={hovered ? 600 : 400}
                >
                  {fitLabel(row.name, maxChars)}
                </text>
                <Group aria-hidden opacity={faded && !hovered ? 0.45 : 1}>
                  {/* "Other" grey alone gets a 1px graphite edge: a wider graphite line underneath. */}
                  {other && (
                    <>
                      <Line
                        from={{ x: xScale(toDate(row.firstCharge)), y }}
                        to={{ x: xScale(toDate(row.lastCharge)), y }}
                        stroke={tokens.textSecondary}
                        strokeWidth={marks.line + 2}
                        strokeLinecap="round"
                      />
                      {row.charges.map((c) => {
                        const x = xScale(getChargeDate(c));
                        return (
                          <Line
                            key={c.date}
                            from={{ x, y: y - 5 }}
                            to={{ x, y: y + 5 }}
                            stroke={tokens.textSecondary}
                            strokeWidth={marks.line + 2}
                            strokeLinecap="round"
                          />
                        );
                      })}
                    </>
                  )}
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
                      {...(other ? otherOutline(row.color) : { stroke: tokens.surface, strokeWidth: marks.ring })}
                    />
                  ))}
                </Group>
                {/* Row-wide hit target. One roving tab stop for the whole chart. */}
                <Bar
                  innerRef={roving.ref(i)}
                  x={-labelWidth}
                  y={y - ROW / 2}
                  width={xMax + labelWidth}
                  height={ROW}
                  fill="transparent"
                  tabIndex={roving.tabIndex(i)}
                  role={onSelect ? "button" : "img"}
                  aria-label={rowLabel(row)}
                  onMouseMove={(e) => onMove(row, e)}
                  onMouseLeave={hideTooltip}
                  onClick={onSelect ? () => onSelect(row.key) : undefined}
                  onFocus={(e) => {
                    roving.onFocus(i, e);
                    setStepping(false);
                    showCharge(row, row.charges.length - 1);
                  }}
                  onBlur={(e) => roving.onBlur(e) && hideTooltip()}
                  onKeyDown={(e) => onKeyDown(row, i, e)}
                  style={{ outline: "none", cursor: onSelect ? "pointer" : undefined }}
                />
                {/* Keyboard focus ring, outside the faded group so it keeps full contrast. */}
                {roving.ringVisible && roving.focused === i && (
                  <Bar
                    aria-hidden
                    x={-labelWidth + 1}
                    y={y - ROW / 2 + 1}
                    width={xMax + labelWidth + margin.right - 2}
                    height={ROW - 2}
                    rx={6}
                    {...focusRing}
                  />
                )}
              </Group>
            );
          })}
          <g aria-hidden>
            <AxisBottom
              top={yMax}
              scale={xScale}
              numTicks={numTicks}
              stroke={tokens.axis}
              hideTicks
              tickFormat={(d) => formatTick(d as Date)}
              tickLabelProps={() => ({ ...axisLabel, textAnchor: "middle", dy: 4 })}
            />
          </g>
        </Group>
      </svg>
      {/* Announces the charge Left / Right / Home / End land on. */}
      <div className="sr-only" aria-live="polite">
        {stepping && focusedKey && tooltipData?.row.key === focusedKey
          ? `${formatDate(tooltipData.charge.date)}: ${formatMoney(tooltipData.charge.amount, tooltipData.row.currency)}${
              tooltipData.change
                ? `, price change ${formatMoney(tooltipData.change.from, tooltipData.row.currency)} to ${formatMoney(tooltipData.change.to, tooltipData.row.currency)}`
                : ""
            }`
          : ""}
      </div>
      {tooltipOpen && tooltipData && (
        <ChartTooltip Portal={TooltipInPortal} left={tooltipLeft} top={tooltipTop}>
          <TooltipRow color={tooltipData.row.color} label={tooltipData.row.name} value="" strong />
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
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            {tooltipData.row.charges.length} charges · since {formatDate(tooltipData.row.firstCharge)}
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}
