"use client";

import { AxisBottom, AxisLeft } from "@visx/axis";
import { localPoint } from "@visx/event";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar, BarRounded, BarStack } from "@visx/shape";
import { type FocusEvent, type MouseEvent, useMemo } from "react";
import { ChartTooltip, TooltipRow, useChartTooltip, useRovingFocus } from "./ChartTooltip";
import { Legend } from "./Legend";
import { axisLabel, focusRing, MIN_TEXT, marks, otherOutline, seriesColor, tokens } from "./palette";
import type { Accessor, Month, MonthlySpend, SeriesMeta } from "./types";

const FLUID = { display: "block", width: "100%", height: "auto" } as const;

type Props<K extends string> = {
  data: MonthlySpend<K>[];
  keys: readonly K[];
  series: readonly SeriesMeta<K>[];
  formatValue: (n: number) => string;
  formatAxisValue: (n: number) => string;
  formatMonth: (m: Month) => string;
  formatMonthLong: (m: Month) => string;
  /** Total height including the x-axis band. */
  height?: number;
  /** Grow past `height` to fill a flex parent (the card stretched by a taller neighbour). */
  fill?: boolean;
};

const margin = { top: 20, right: 8, bottom: 28, left: 52 };
const getMonth: Accessor<MonthlySpend<string>, Month> = (d) => d.month;
const getTotal: Accessor<MonthlySpend<string>, number> = (d) => d.total;

/** Monthly recurring spend, stacked by subscription ("Other" folds everything past slot 7). */
export function SpendColumns<K extends string>(props: Props<K>) {
  const height = props.height ?? 300;
  return (
    <div className={props.fill ? "flex flex-1 flex-col" : undefined}>
      <Legend items={props.series.map((s) => ({ key: s.key, label: s.name, color: s.color }))} />
      <ParentSize initialSize={{ width: 560, height }} style={props.fill ? { flex: 1, minHeight: height } : { height }} debounceTime={40}>
        {({ width, height: measured }) =>
          width > 0 ? <Columns {...props} width={width} height={props.fill ? Math.max(height, measured) : height} /> : null
        }
      </ParentSize>
    </div>
  );
}

function Columns<K extends string>({
  data,
  keys,
  series,
  formatValue,
  formatAxisValue,
  formatMonth,
  formatMonthLong,
  width,
  height,
}: Props<K> & { width: number; height: number }) {
  const { tooltipOpen, tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip, containerRef, TooltipInPortal } =
    useChartTooltip<MonthlySpend<K>>();
  const xMax = Math.max(0, width - margin.left - margin.right);
  const yMax = Math.max(0, height - margin.top - margin.bottom);

  const xScale = useMemo(() => scaleBand<Month>({ domain: data.map(getMonth), range: [0, xMax], padding: 0.25 }), [data, xMax]);
  const yScale = useMemo(
    () => scaleLinear<number>({ domain: [0, Math.max(1, ...data.map(getTotal))], range: [yMax, 0], nice: true }),
    [data, yMax],
  );
  const colorOf = useMemo(() => new Map(series.map((s) => [s.key, s.color])), [series]);
  const barWidth = Math.min(marks.maxBar, xScale.bandwidth());
  const step = xScale.step();
  // Thin out month labels when columns get narrow so they never collide.
  const labelEvery = step < 30 ? 3 : step < 44 ? 2 : 1;
  const tickValues = data.map(getMonth).filter((_, i) => (data.length - 1 - i) % labelEvery === 0);
  const last = data.at(-1);
  const bandX = (d: MonthlySpend<K>) => (xScale(d.month) ?? 0) - (step - xScale.bandwidth()) / 2;
  // One tab stop for the whole chart; it enters on the latest month.
  const roving = useRovingFocus(data.length, data.length - 1);
  const focusedMonth = roving.ringVisible && roving.focused !== null ? data[roving.focused] : undefined;

  const show = (d: MonthlySpend<K>, e: MouseEvent<SVGRectElement> | FocusEvent<SVGRectElement>) => {
    const x = (xScale(d.month) ?? 0) + margin.left + xScale.bandwidth() / 2;
    const point = "clientX" in e ? localPoint(e) : null;
    showTooltip({ tooltipData: d, tooltipLeft: point?.x ?? x, tooltipTop: point?.y ?? margin.top + yScale(d.total) });
  };

  /** The month total, then every contributor largest first: everything the tooltip shows. */
  const monthLabel = (d: MonthlySpend<K>) => {
    const parts = series
      .filter((s) => d[s.key] > 0)
      .sort((a, b) => d[b.key] - d[a.key])
      .map((s) => `${s.name} ${formatValue(d[s.key])}`);
    return `${formatMonthLong(d.month)}: ${formatValue(d.total)}${parts.length ? ` — ${parts.join(", ")}` : ""}`;
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
        aria-label="Monthly subscription spend, stacked by subscription. Use the arrow keys to move between months."
      >
        <Group left={margin.left} top={margin.top}>
          <g aria-hidden>
            <GridRows scale={yScale} width={xMax} numTicks={4} stroke={tokens.grid} strokeWidth={1} />
          </g>
          {/* Hover band sits behind the marks so it never washes them out. */}
          {tooltipOpen && tooltipData && (
            <Bar aria-hidden x={bandX(tooltipData)} y={0} width={step} height={yMax} rx={6} fill={tokens.grid} fillOpacity={0.45} />
          )}
          <BarStack<MonthlySpend<K>, K>
            data={data}
            keys={[...keys]}
            x={getMonth}
            xScale={xScale}
            yScale={yScale}
            color={(key) => seriesColor(colorOf.get(key) ?? null)}
          >
            {(stacks) => {
              // The 4px rounded data-end goes only on the top *non-empty* segment of each column.
              const topLayer = data.map((_, i) => {
                for (let s = stacks.length - 1; s >= 0; s--) if ((stacks[s].bars[i]?.height ?? 0) > 0.5) return s;
                return -1;
              });
              return (
                <g aria-hidden>
                  {stacks.map((stack, s) => {
                    // "Other" alone gets a 1px graphite outline, inset so the bar keeps its footprint.
                    const outline = otherOutline(colorOf.get(stack.key) ?? null);
                    const inset = "stroke" in outline ? 0.5 : 0;
                    return stack.bars.map((bar) => {
                      if (bar.height <= 0.5) return null;
                      const x = bar.x + (bar.width - barWidth) / 2 + inset;
                      const w = Math.max(0, barWidth - inset * 2);
                      if (topLayer[bar.index] === s) {
                        return (
                          <BarRounded
                            key={`${stack.key}-${bar.index}`}
                            x={x}
                            y={bar.y + inset}
                            width={w}
                            height={Math.max(0, bar.height - inset * 2)}
                            radius={marks.radius}
                            top
                            fill={bar.color}
                            {...outline}
                          />
                        );
                      }
                      // 2px surface gap: shrink the segment from its top, never stroke it.
                      const h = Math.max(0, bar.height - marks.gap - inset * 2);
                      return (
                        <Bar
                          key={`${stack.key}-${bar.index}`}
                          x={x}
                          y={bar.y + marks.gap + inset}
                          width={w}
                          height={h}
                          fill={bar.color}
                          {...outline}
                        />
                      );
                    });
                  })}
                </g>
              );
            }}
          </BarStack>
          {/* Direct label: only the latest month's total. */}
          {last && last.total > 0 && (
            <text
              aria-hidden
              x={(xScale(last.month) ?? 0) + xScale.bandwidth() / 2}
              y={yScale(last.total) - 6}
              textAnchor="middle"
              fontSize={MIN_TEXT}
              fontWeight={600}
              fill={tokens.textPrimary}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatAxisValue(last.total)}
            </text>
          )}
          {/* Hit targets: the whole band, full height — bigger than the marks. One roving tab stop. */}
          {data.map((d, i) => (
            <Bar
              key={`hit-${d.month}`}
              innerRef={roving.ref(i)}
              x={bandX(d)}
              y={0}
              width={step}
              height={yMax}
              fill="transparent"
              tabIndex={roving.tabIndex(i)}
              role="img"
              aria-label={monthLabel(d)}
              onMouseMove={(e) => show(d, e)}
              onMouseLeave={hideTooltip}
              onFocus={(e) => {
                roving.onFocus(i, e);
                show(d, e);
              }}
              onBlur={(e) => roving.onBlur(e) && hideTooltip()}
              onKeyDown={(e) => (e.key === "Escape" ? hideTooltip() : roving.onKeyDown(i, e))}
              style={{ outline: "none" }}
            />
          ))}
          {/* Keyboard focus ring around the focused band: SVG marks get no native outline. */}
          {focusedMonth && (
            <Bar
              aria-hidden
              x={bandX(focusedMonth) + 1}
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
              tickFormat={(m) => formatMonth(m)}
              tickLabelProps={() => ({ ...axisLabel, textAnchor: "middle", dy: 4 })}
            />
          </g>
        </Group>
      </svg>
      {tooltipOpen && tooltipData && (
        <ChartTooltip Portal={TooltipInPortal} left={tooltipLeft} top={tooltipTop}>
          <TooltipRow label={formatMonthLong(tooltipData.month)} value={formatValue(tooltipData.total)} strong />
          <div className="my-1.5 h-px bg-[var(--grid)]" />
          {[...series]
            .reverse()
            .filter((s) => tooltipData[s.key] > 0)
            .map((s) => (
              <TooltipRow key={s.key} color={s.color} label={s.name} value={formatValue(tooltipData[s.key])} />
            ))}
        </ChartTooltip>
      )}
    </div>
  );
}
