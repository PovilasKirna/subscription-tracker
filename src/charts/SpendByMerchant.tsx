"use client";

import { barX, type ChartPoint, defineChart, text } from "@tanstack/charts";
import { crosshair } from "@tanstack/charts/crosshair";
import { Chart } from "@tanstack/charts/react/tooltip";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { useId, useMemo } from "react";
import { TooltipDivider, TooltipNote, TooltipRow } from "./ChartTooltip";
import { Legend } from "./Legend";
import { fitLabel, MIN_TEXT, marks, seriesColor, tokens } from "./palette";
import { axisLine, chartTheme, chartTooltip, focusRing, gridLine, tickLabels } from "./theme";
import type { Accessor } from "./types";

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
const AXIS = 24; // the x-axis band under the rows

const PAID = seriesColor(1);
/**
 * Subsidised: stripes of the same hue over a pale tint, with a full-colour outline. Reads as the
 * lighter part of one bar, while the stripes and outline keep 3:1+ against the card in both themes
 * (a plain pale fill would not).
 */
const TINT = "color-mix(in oklab, var(--series-1) 25%, var(--surface-1))";
const STRIPE = 2;
const STRIPE_STEP = 5;
/** The same stripes as a CSS background, for the legend and tooltip swatches. */
const SUBSIDISED_SWATCH = `repeating-linear-gradient(135deg, ${PAID} 0 ${STRIPE}px, ${TINT} ${STRIPE}px ${STRIPE_STEP - 0.5}px)`;
const LEGEND = [
  { key: "paid", label: "Paid by me", color: PAID },
  { key: "subsidised", label: "Subsidised", color: SUBSIDISED_SWATCH },
];

/** One merchant, with the split precomputed so every mark reads the same row. */
type Row<T> = { key: string; label: string; value: number; paid: number; sub: number; item: T };

/** Horizontal bars, sorted descending: what you paid (slot 1), then what was paid back (lighter). */
export function SpendByMerchant<T>({ data, getKey, getLabel, getValue, getSubsidised, formatValue, formatAxisValue }: Props<T>) {
  // The stripes are an SVG <pattern> in a zero-size sibling <svg>; the bars reference it by id.
  const patternId = `subsidised-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const rows = useMemo<Row<T>[]>(
    () =>
      [...data]
        .sort((a, b) => getValue(b) - getValue(a))
        .map((item) => {
          const value = getValue(item);
          const sub = Math.min(getSubsidised(item), value);
          return { key: getKey(item), label: getLabel(item), value, paid: value - sub, sub, item };
        }),
    [data, getKey, getLabel, getValue, getSubsidised],
  );
  const total = rows.reduce((s, r) => s + r.value, 0);
  const anySubsidised = rows.some((r) => r.sub > 0);

  const share = useMemo(() => (r: Row<T>) => (total > 0 ? `${Math.round((r.value / total) * 100)}% of subscription spend` : ""), [total]);
  /** Name, amount, the paid / subsidised split and the share: everything the tooltip shows. */
  const rowLabel = useMemo(
    () => (r: Row<T>) =>
      [`${r.label}: ${formatValue(r.value)}`, r.sub > 0 && `${formatValue(r.paid)} paid by me, ${formatValue(r.sub)} subsidised`, share(r)]
        .filter(Boolean)
        .join(", "),
    [formatValue, share],
  );

  const definition = useMemo(() => {
    const labelOf = new Map(rows.map((r) => [r.key, r.label]));
    const subsidised = rows.filter((r) => r.sub > 0);
    return defineChart(
      ({ width }) => ({
        marks: [
          crosshair({ x: false, y: { band: { radius: 6, inset: -2, fill: tokens.grid, fillOpacity: 0.45 } } }),
          // Square at the baseline; the outer segment carries the 4px rounded data-end.
          barX(rows, {
            id: "paid",
            x1: 0,
            x2: (r) => (r.sub > 0 ? r.paid : Math.max(r.value, 0)),
            y: "key",
            fill: PAID,
            maxThickness: BAR,
            radius: (r) => (r.sub > 0 ? 0 : [0, marks.radius, marks.radius, 0]),
            states: [{ when: { focus: "unmatched" }, style: { opacity: 0.6 } }],
          }),
          // A 2px surface gap before the subsidised segment: the same geometry, stroked in the card
          // colour, drawn underneath it.
          barX(subsidised, {
            id: "gap",
            x1: "paid",
            x2: "value",
            y: "key",
            fill: tokens.surface,
            stroke: tokens.surface,
            strokeWidth: marks.gap * 2,
            maxThickness: BAR,
            radius: [0, marks.radius, marks.radius, 0],
          }),
          barX(subsidised, {
            id: "subsidised",
            x1: "paid",
            x2: "value",
            y: "key",
            fill: `url(#${patternId})`,
            stroke: PAID,
            strokeWidth: 1,
            maxThickness: BAR - 1,
            radius: [0, marks.radius, marks.radius, 0],
            states: [{ when: { focus: "unmatched" }, style: { opacity: 0.6 } }],
          }),
          text(rows, {
            x: "value",
            y: "key",
            text: (r) => formatValue(r.value),
            anchor: "start",
            dx: 6,
            fontSize: MIN_TEXT,
            fill: tokens.textSecondary,
          }),
        ],
        scales: {
          x: {
            scale: scaleLinear().domain([0, Math.max(1, ...rows.map((r) => r.value))]),
            nice: true,
            grid: gridLine,
            axis: { line: axisLine, ticks: { spacing: 80, size: 0, format: formatAxisValue }, tickLabels },
          },
          y: {
            scale: () => scaleBand<string>().padding(0),
            axis: {
              line: false,
              ticks: { size: 0, padding: 12, format: (key) => fitLabel(labelOf.get(key) ?? key, width < 420 ? 12 : 18) },
              tickLabels: { ...tickLabels, thin: false },
            },
          },
        },
        // Right: room for the value label at the end of the longest bar.
        margin: { top: 0, right: 72 },
      }),
      {
        theme: chartTheme,
        focusRing,
        // One stop per merchant: the whole row picks it, and the arrow keys step through merchants.
        focus: "group-y",
        maxFocusDistance: Number.POSITIVE_INFINITY,
        tooltip: { ...chartTooltip, format: (point: ChartPoint<Row<T>>) => rowLabel(point.datum) },
      },
    );
  }, [rows, patternId, formatValue, formatAxisValue, rowLabel]);

  return (
    <div>
      {anySubsidised && <Legend items={LEGEND} />}
      <svg width={0} height={0} aria-hidden className="absolute">
        <defs>
          <pattern id={patternId} width={STRIPE_STEP} height={STRIPE_STEP} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={STRIPE_STEP} height={STRIPE_STEP} fill={TINT} />
            <rect width={STRIPE} height={STRIPE_STEP} fill={PAID} />
          </pattern>
        </defs>
      </svg>
      <Chart
        definition={definition}
        height={rows.length * ROW + AXIS}
        initialWidth={345}
        ariaLabel="Spend by merchant"
        ariaDescription="Use the arrow keys to move between merchants."
        renderTooltipBody={({ points }) => {
          const r = points[0]?.datum;
          if (!r) return null;
          return (
            <>
              <TooltipRow label={r.label} value={formatValue(r.value)} strong />
              {r.sub > 0 && (
                <>
                  <TooltipDivider />
                  <TooltipRow color={PAID} label="Paid by me" value={formatValue(r.paid)} />
                  <TooltipRow color={SUBSIDISED_SWATCH} label="Subsidised" value={formatValue(r.sub)} />
                </>
              )}
              {total > 0 && <TooltipNote>{share(r)}</TooltipNote>}
            </>
          );
        }}
      />
    </div>
  );
}
