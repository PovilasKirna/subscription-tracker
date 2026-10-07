"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ChartColumnIcon,
  ChartSplineIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleMinusIcon,
  CirclePlusIcon,
  ListIcon,
  PiggyBankIcon,
} from "lucide-react";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { type PointerEvent, useMemo, useRef, useState, useTransition } from "react";
import { type SpendingBarPoint, SpendingBars, SpendingPace, type SpendingPacePoint, seriesColor } from "@/charts";
import { ChartCardSkeleton } from "@/components/overview/skeletons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { money } from "@/lib/format";
import { spendingQuery } from "@/lib/query/options";
import { useCategories } from "@/lib/query/useCategories";
import { SPENDING_RANGES, spendingParams } from "@/lib/search-params";
import type { SpendingCategory, SpendingPayload, SpendingRange } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CategoryIcon, categoryColor } from "./CategoryIcon";

// ---------- period labels ----------

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" });
const MONTH_LONG = fmt({ month: "long" });
const MONTH_YEAR = fmt({ month: "long", year: "numeric" });
const MONTH_SHORT = fmt({ month: "short" });
const MONTH_SHORT_YEAR = fmt({ month: "short", year: "numeric" });
const DAY_MONTH = fmt({ day: "numeric", month: "short" });
const DAY_MONTH_YEAR = fmt({ day: "numeric", month: "short", year: "numeric" });
const WEEKDAY = fmt({ weekday: "short" });
const WEEKDAY_DATE = fmt({ weekday: "short", day: "numeric", month: "short" });
const d = (date: string) => new Date(`${date.length === 7 ? `${date}-01` : date}T00:00:00Z`);

const RANGE_LABEL: Record<SpendingRange, string> = { "1w": "1W", "1m": "1M", "6m": "6M", "1y": "1Y" };

/** "October 2026", "22–28 Sep 2026", "May – Oct 2026", "2026". */
function periodTitle(range: SpendingRange, start: string, end: string): string {
  if (range === "1m") return MONTH_YEAR.format(d(start));
  if (range === "1y") return start.slice(0, 4);
  if (range === "1w") return `${DAY_MONTH.format(d(start))} – ${DAY_MONTH_YEAR.format(d(end))}`;
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${(sameYear ? MONTH_SHORT : MONTH_SHORT_YEAR).format(d(start))} – ${MONTH_SHORT_YEAR.format(d(end))}`;
}

/** Short names for the tooltip: "October" / "September", "This week" / "Last week", "May–Oct ’26" / "Nov ’25–Apr ’26", "2026" / "2025". */
function seriesNames(p: SpendingPayload): { current: string; previous: string } {
  if (p.range === "1m") return { current: MONTH_LONG.format(d(p.period.start)), previous: MONTH_LONG.format(d(p.previousPeriod.start)) };
  if (p.range === "1w")
    return p.isCurrent ? { current: "This week", previous: "Last week" } : { current: "That week", previous: "Week before" };
  if (p.range === "1y") return { current: p.period.start.slice(0, 4), previous: p.previousPeriod.start.slice(0, 4) };
  // With short years, so this period and the last ("Nov–Oct" both) can be told apart: "Nov ’25–Oct ’26".
  const withYear = (date: string) => `${MONTH_SHORT.format(d(date))} ’${date.slice(2, 4)}`;
  const span = (a: string, b: string) =>
    a.slice(0, 4) === b.slice(0, 4) ? `${MONTH_SHORT.format(d(a))}–${withYear(b)}` : `${withYear(a)}–${withYear(b)}`;
  return { current: span(p.period.start, p.period.end), previous: span(p.previousPeriod.start, p.previousPeriod.end) };
}

/** The period before, mid-sentence: "vs September", "vs last week", "vs Nov–Apr". */
function previousName(p: SpendingPayload): string {
  const name = seriesNames(p).previous;
  return p.range === "1w" ? name.toLowerCase() : name;
}

/** Axis label and tooltip title of each point. */
function pointLabels(p: SpendingPayload, key: string): { label: string; title: string } {
  if (p.period.unit === "month") return { label: MONTH_SHORT.format(d(key)), title: MONTH_SHORT_YEAR.format(d(key)) };
  if (p.range === "1w") return { label: WEEKDAY.format(d(key)), title: WEEKDAY_DATE.format(d(key)) };
  return { label: String(Number(key.slice(8, 10))), title: DAY_MONTH_YEAR.format(d(key)) };
}

/** A day inside the period `by` periods away (−1 back, +1 forward). */
function shiftAt(p: SpendingPayload, by: number): string {
  if (p.range === "1w") {
    const t = d(p.period.start).getTime() + by * 7 * 86_400_000;
    return new Date(t).toISOString().slice(0, 10);
  }
  const months = p.range === "1m" ? 1 : p.range === "6m" ? 6 : 12;
  const base = d(p.range === "1m" ? p.period.start : p.period.end.slice(0, 7));
  const moved = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + by * months, 1));
  return moved.toISOString().slice(0, 10);
}

// ---------- state ----------

function useSpending() {
  const [isPending, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(spendingParams, { startTransition });
  const { data } = useSuspenseQuery(spendingQuery(params.range, params.at));
  const go = (by: number) => {
    if (by > 0 && data.isCurrent) return;
    if (by < 0 && !data.canGoBack) return;
    const at = shiftAt(data, by);
    // Back at (or past) the current period: drop `at` so the URL means "now".
    void setParams({ at: at > data.today ? null : at });
  };
  return { data, params, setParams, isPending, go };
}

export function SpendingView() {
  const { data, isPending } = useSpending();
  return (
    <div className={cn("flex flex-col gap-4", isPending && "opacity-60 transition-opacity")}>
      {data.otherCurrencies.length > 0 && (
        <p className="flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
          <CircleAlertIcon className="size-3.5" aria-hidden />
          Totals are in {data.baseCurrency}; payments in {data.otherCurrencies.join(", ")} aren't included.
        </p>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <SpentCard />
          <RangeSwitch className="mx-auto -mt-1 md:hidden" />
          <CategoriesCard data={data} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <IncomeCard data={data} />
          <CashflowCard data={data} />
          <SavedCard data={data} className="sm:col-span-2 lg:col-span-1" />
        </div>
      </div>
    </div>
  );
}

/** Line or bar chart. In the page header on phones; in the chart's card from md up. */
function ViewSwitch({ className }: { className?: string }) {
  const { params, setParams } = useSpending();
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      className={className}
      value={[params.view]}
      onValueChange={(v: string[]) => v[0] && void setParams({ view: v[0] === "bar" ? "bar" : null })}
      aria-label="Chart style"
    >
      <ToggleGroupItem value="line" aria-label="Line chart" className="px-2">
        <ChartSplineIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="bar" aria-label="Bar chart" className="px-2">
        <ChartColumnIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

/** 1W / 1M / 6M / 1Y. In the page header from md up; under the chart on phones. */
function RangeSwitch({ className }: { className?: string }) {
  const { params, setParams } = useSpending();
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      className={className}
      value={[params.range]}
      onValueChange={(v: string[]) => v[0] && void setParams({ range: v[0] === "1m" ? null : (v[0] as SpendingRange) })}
      aria-label="Period length"
    >
      {SPENDING_RANGES.map((r) => (
        <ToggleGroupItem key={r} value={r} className="px-2.5 text-xs max-md:px-4">
          {RANGE_LABEL[r]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

// ---------- spent ----------

/**
 * The page's controls, outside the cards (they scope every card, not just the chart): the period
 * with its arrows, its length, and the chart style. Rendered in the page header.
 */
export function SpendingControls() {
  const { data, go, isPending } = useSpending();
  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-2", isPending && "opacity-60")}>
      <div className="flex min-w-0 items-center">
        <Button variant="ghost" size="icon-sm" aria-label="Previous period" disabled={!data.canGoBack} onClick={() => go(-1)}>
          <ChevronLeftIcon />
        </Button>
        <span className="min-w-28 truncate text-center text-sm font-medium">
          {periodTitle(data.range, data.period.start, data.period.end)}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Next period" disabled={data.isCurrent} onClick={() => go(1)}>
          <ChevronRightIcon />
        </Button>
      </div>
      {/* Phones: under the chart instead (see SpendingView). */}
      <RangeSwitch className="max-md:hidden" />
      {/* From md up the chart style switch sits in the chart's card instead. */}
      <ViewSwitch className="md:hidden" />
    </div>
  );
}

function SpentCard() {
  const { data, params, go } = useSpending();
  const cur = data.baseCurrency;
  const names = seriesNames(data);
  const formatValue = (n: number) => money(n, cur);
  const formatAxisValue = (n: number) => money(n, cur, { cents: false, compact: n >= 10_000 });

  const pace = useMemo(
    (): SpendingPacePoint[] =>
      data.points.map((p) => ({ ...pointLabels(data, p.key), spent: p.spent, previous: p.previous, projected: p.projected })),
    [data],
  );
  const bars = useMemo(
    (): SpendingBarPoint[] =>
      data.points.map((p) => ({
        ...pointLabels(data, p.key),
        amount: p.amount,
        previousAmount: p.previousAmount,
        projectedAmount: p.projectedAmount,
      })),
    [data],
  );
  const endLabels = [
    { value: data.projected ?? data.spent },
    ...(data.previousTotal > 0 ? [{ value: data.previousTotal, muted: true }] : []),
  ];

  // Swipe sideways on the chart to move between periods (touch and pen; the mouse has the arrows above).
  const start = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") start.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) go(dx > 0 ? -1 : 1);
  };

  return (
    <Card>
      <CardContent>
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm text-muted-foreground">Spent · {periodTitle(data.range, data.period.start, data.period.end)}</div>
          <ViewSwitch className="max-md:hidden" />
        </div>
        <div className="text-5xl font-semibold tracking-tight tabular-nums">{money(data.spent, cur, { cents: false })}</div>
        <PaceChange data={data} />

        <div className="mt-4 touch-pan-y select-none" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
          {params.view === "bar" ? (
            <SpendingBars
              data={bars}
              label={names.current}
              previousLabel={names.previous}
              height={240}
              formatValue={formatValue}
              formatAxisValue={formatAxisValue}
            />
          ) : (
            <SpendingPace
              data={pace}
              label={names.current}
              previousLabel={names.previous}
              endLabels={endLabels}
              height={240}
              formatValue={formatValue}
              formatAxisValue={formatAxisValue}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * "▼ €91 · October": how this period compares with the last one at the same point, Revolut-style. The
 * triangle and colour say which way (red: spent more, green: less); the label names this period.
 */
function PaceChange({ data }: { data: SpendingPayload }) {
  const diff = data.spent - data.previousComparable;
  const more = diff > 0.5;
  const less = diff < -0.5;
  const previous = previousName(data);
  return (
    <div
      className="mt-1.5 flex items-center gap-1.5 text-[15px] font-medium"
      title={data.isCurrent ? `Compared with ${previous} at the same point` : `Compared with ${previous}`}
    >
      <span
        className={cn("inline-flex items-center gap-1 tabular-nums", more && "text-[var(--delta-bad)]", less && "text-[var(--delta-good)]")}
      >
        <span aria-hidden className="text-[11px]">
          {more ? "▲" : less ? "▼" : "●"}
        </span>
        <span className="sr-only">
          {more ? "More than" : less ? "Less than" : "Same as"} {previous}:
        </span>
        {money(Math.abs(diff), data.baseCurrency, { cents: false })}
      </span>
      <span className="text-[var(--text-muted)]">· {seriesNames(data).current}</span>
    </div>
  );
}

/** A change with its sign; colour says whether it's good (never colour alone). */
function Change({ value, currency, moreIsBad }: { value: number; currency: string; moreIsBad?: boolean }) {
  const up = value > 0.005;
  const down = value < -0.005;
  const good = moreIsBad ? down : up;
  const bad = moreIsBad ? up : down;
  return (
    <span className={cn("font-medium tabular-nums", good && "text-[var(--delta-good)]", bad && "text-[var(--delta-bad)]")}>
      {up ? "+" : down ? "−" : "±"}
      {money(Math.abs(value), currency, { cents: false })}
    </span>
  );
}

/** Transactions of the period (to today), optionally of one category. */
const transactionsHref = (data: SpendingPayload, category?: string) =>
  `/transactions?${new URLSearchParams({ ...(category && { category }), from: data.period.start, to: data.period.cutoff })}`;

// ---------- income, savings & cashflow ----------

/** A stacked bar of categories' shares and a list of them, each linking to its payments. */
function Breakdown({ data, categories }: { data: SpendingPayload; categories: SpendingCategory[] }) {
  const lookup = useCategories();
  const cur = data.baseCurrency;
  // Unlike spending categories, these are told apart by colour; the neutral grey stands in for none.
  const color = (id: string) => seriesColor(lookup.of(id).color);
  return (
    <>
      <div className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {categories.map((c) => (
          <div key={c.id} style={{ width: `${Math.max(0, c.share) * 100}%`, background: color(c.id) }} />
        ))}
      </div>
      <ul className="mt-2.5 flex flex-col gap-1 text-[13px]">
        {categories.map((c) => (
          <li key={c.id}>
            <Link href={transactionsHref(data, c.id)} className="flex items-center gap-2 rounded-md hover:text-foreground">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color(c.id) }} />
              <span className="truncate text-[var(--text-secondary)]">{lookup.of(c.id).label}</span>
              <span className="ml-auto font-medium tabular-nums">{money(c.amount, cur, { cents: false })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function IncomeCard({ data }: { data: SpendingPayload }) {
  const cur = data.baseCurrency;
  const { total, previous, categories } = data.income;
  return (
    <Card>
      <CardContent>
        <div className="text-sm text-muted-foreground">Income</div>
        <div className="mt-1 text-[28px] font-semibold tracking-tight tabular-nums">{money(total, cur, { cents: false })}</div>
        <div className="mt-1 text-[12.5px] text-[var(--text-muted)]">
          <Change value={total - previous} currency={cur} /> vs {previousName(data)}
        </div>
        {total > 0 && <Breakdown data={data} categories={categories} />}
      </CardContent>
    </Card>
  );
}

/**
 * Money put aside in savings categories: neither spent nor earned, so it isn't in Spent or the
 * cashflow. Money taken back out of savings counts against it, so the total can be negative. Shown
 * while there's a savings category to put payments in, or anything saved in either period.
 */
function SavedCard({ data, className }: { data: SpendingPayload; className?: string }) {
  const lookup = useCategories();
  const cur = data.baseCurrency;
  const { total, previous, categories } = data.saved;
  const hasSavings = lookup.list.some((c) => c.kind === "savings" && !c.hidden);
  if (!hasSavings && !total && !previous) return null;
  const ofIncome = data.income.total > 0 && total > 0 ? Math.round((total / data.income.total) * 100) : null;
  return (
    <Card className={className}>
      <CardContent>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <PiggyBankIcon className="size-3.5" aria-hidden /> Saved
        </div>
        <div className="mt-1 text-[28px] font-semibold tracking-tight tabular-nums">
          {total < 0 && "−"}
          {money(Math.abs(total), cur, { cents: false })}
        </div>
        <div className="mt-1 text-[12.5px] text-[var(--text-muted)]">
          <Change value={total - previous} currency={cur} /> vs {previousName(data)}
          {ofIncome !== null && <> · {ofIncome}% of income</>}
        </div>
        {categories.length > 0 ? (
          <Breakdown data={data} categories={categories} />
        ) : (
          <p className="mt-3 text-[12.5px] text-[var(--text-muted)]">
            Nothing put aside in this period. Payments in a{" "}
            <Link href="/settings/categories" className="underline underline-offset-2 hover:text-foreground">
              savings category
            </Link>{" "}
            show up here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CashflowCard({ data }: { data: SpendingPayload }) {
  const cur = data.baseCurrency;
  const inflow = data.income.total;
  const outflow = data.spent;
  const max = Math.max(inflow, outflow, 1);
  const positive = data.cashflow >= 0;
  return (
    <Card>
      <CardContent>
        <div className="text-sm text-muted-foreground">Net cashflow</div>
        {/* The number stays neutral; the Positive / Negative line below carries the colour. */}
        <div className="mt-1 text-[28px] font-semibold tracking-tight tabular-nums">
          {positive ? "+" : "−"}
          {money(Math.abs(data.cashflow), cur, { cents: false })}
        </div>
        <div
          className={cn(
            "mt-1 inline-flex items-center gap-1 text-[13px] font-medium",
            positive ? "text-[var(--delta-good)]" : "text-[var(--delta-bad)]",
          )}
        >
          {positive ? <CirclePlusIcon className="size-3.5" aria-hidden /> : <CircleMinusIcon className="size-3.5" aria-hidden />}
          {positive ? "Positive" : "Negative"}
        </div>
        <div className="mt-4 flex flex-col gap-2 text-[12.5px]">
          <FlowBar label="In" value={inflow} max={max} color="var(--delta-good)" currency={cur} />
          <FlowBar label="Out" value={outflow} max={max} color="var(--delta-bad)" currency={cur} />
        </div>
      </CardContent>
    </Card>
  );
}

function FlowBar({ label, value, max, color, currency }: { label: string; value: number; max: number; color: string; currency: string }) {
  return (
    <div className="grid grid-cols-[2rem_1fr_auto] items-center gap-2">
      <span className="text-[var(--text-muted)]">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${(Math.max(0, value) / max) * 100}%`, background: color }} />
      </div>
      <span className="font-medium tabular-nums">{money(value, currency, { cents: false })}</span>
    </div>
  );
}

// ---------- categories ----------

/** Categories shown before "See all": enough for the usual big ones without a long list. */
const TOP_CATEGORIES = 6;

function CategoriesCard({ data }: { data: SpendingPayload }) {
  const [showAll, setShowAll] = useState(false);
  const cur = data.baseCurrency;
  const max = Math.max(1, ...data.categories.map((c) => c.amount));
  const visible = showAll ? data.categories : data.categories.slice(0, TOP_CATEGORIES);
  const hidden = data.categories.length - TOP_CATEGORIES;
  return (
    <Card>
      <CardHeader>
        <CardTitle>By category</CardTitle>
        <CardDescription>Tap a category to see its payments.</CardDescription>
        <CardAction>
          <Link href={transactionsHref(data)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ListIcon /> Transactions
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {data.categories.length ? (
          <>
            <ul className="flex flex-col">
              {visible.map((c) => (
                <CategoryRow key={c.id} c={c} href={transactionsHref(data, c.id)} currency={cur} max={max} />
              ))}
            </ul>
            {hidden > 0 && (
              <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                {showAll ? "Show fewer" : `See all ${data.categories.length} categories`}
              </Button>
            )}
          </>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">No spending in this period.</p>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryRow({ c, href, currency, max }: { c: SpendingCategory; href: string; currency: string; max: number }) {
  const category = useCategories().of(c.id);
  const diff = c.amount - c.previous;
  return (
    <li>
      <Link href={href} className="-mx-2 grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted">
        <CategoryIcon id={c.id} />
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-medium">{category.label}</span>
            <span className="shrink-0 text-xs text-[var(--text-muted)]">
              {c.count} payment{c.count === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="h-full rounded-full"
              style={{ width: `${(Math.max(0, c.amount) / max) * 100}%`, background: categoryColor(category.color) }}
            />
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold tabular-nums">{money(c.amount, currency, { cents: false })}</div>
          <div className="text-xs text-[var(--text-muted)] tabular-nums">
            {Math.round(c.share * 100)}%
            {c.previous > 0 || c.amount > 0 ? (
              <>
                {" "}
                · <Change value={diff} currency={currency} moreIsBad />
              </>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}

export function SpendingViewSkeleton() {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.55fr_1fr]">
      <ChartCardSkeleton height={340} />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  );
}
