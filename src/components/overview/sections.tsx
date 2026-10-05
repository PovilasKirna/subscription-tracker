"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, ListIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryStates } from "nuqs";
import { useMemo, useTransition } from "react";
import {
  ChartCard,
  type MonthlySpend,
  RenewalCalendar,
  type SeriesMeta,
  SpendByMerchant,
  SpendColumns,
  SubscriptionTimeline,
} from "@/charts";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fullDate, money, monthLabel, monthYearLabel } from "@/lib/format";
import { addMonths, isLive, type MerchantSpend, projectChargesBetween, spendByMerchant } from "@/lib/insights";
import { historyQuery, subscriptionsQuery } from "@/lib/query/options";
import { OVERVIEW_RANGES, type OverviewRange, overviewParams, RENEWAL_MONTHS_AHEAD } from "@/lib/search-params";
import type { HistoryPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CHART_SLOT } from "./layout";
import { drawerHref } from "./links";
import { RenewalAgenda } from "./RenewalAgenda";
import { type RenewalView, useRenewalView } from "./renewal-view";

/** Stack-layer key; a template literal so it can never collide with `month` / `total`. */
type LayerKey = `s:${number}`;

function toMonthlySpend(h: HistoryPayload): { rows: MonthlySpend<LayerKey>[]; series: SeriesMeta<LayerKey>[] } {
  const series = h.series.map((s, i): SeriesMeta<LayerKey> => ({ key: `s:${i}`, name: s.name, color: s.color }));
  const rows = h.months.map((month, i) => {
    const row: MonthlySpend<LayerKey> = { month, total: h.totals[i] };
    h.series.forEach((s, j) => {
      row[`s:${j}`] = s.values[i];
    });
    return row;
  });
  return { rows, series };
}

/** "12m" stays "12m"; "ytd" reads "YTD". */
const rangeLabel = (r: string) => (r === "ytd" ? "YTD" : r);

/** The Overview period (?range=). Both spend charts read and set the same param, so they always agree. */
function RangeToggle({ value, onChange, label }: { value: OverviewRange; onChange: (v: OverviewRange) => void; label: string }) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      value={[value]}
      onValueChange={(v: string[]) => v[0] && onChange(v[0] as OverviewRange)}
      aria-label={label}
    >
      {OVERVIEW_RANGES.map((o) => (
        <ToggleGroupItem key={o} value={o} className="px-2 text-[12.5px] pointer-coarse:h-11 pointer-coarse:min-w-11">
          {rangeLabel(o)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Phones only: the renewals month as a list or as the calendar grid (md and up always show the grid). */
function RenewalViewToggle({ value, onChange }: { value: RenewalView; onChange: (v: RenewalView) => void }) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      value={[value]}
      onValueChange={(v: string[]) => v[0] && onChange(v[0] as RenewalView)}
      aria-label="Renewals view"
      className="md:hidden"
    >
      <ToggleGroupItem value="list" aria-label="List" title="List" className="pointer-coarse:size-11">
        <ListIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="calendar" aria-label="Calendar" title="Calendar" className="pointer-coarse:size-11">
        <CalendarDaysIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function OnboardingBanner() {
  const { data } = useSuspenseQuery(subscriptionsQuery());
  if (data.subscriptions.length || data.ignored.length) return null;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-medium">No subscriptions yet</div>
          <p className="text-sm text-muted-foreground">Import a Revolut CSV statement or connect your bank to get started.</p>
        </div>
        <Link href="/settings/data" className={buttonVariants()}>
          <UploadIcon /> Import data
        </Link>
      </CardContent>
    </Card>
  );
}

export function SpendSection() {
  const [isPending, startTransition] = useTransition();
  const [{ range }, setParams] = useQueryStates(overviewParams, { startTransition });
  const { data } = useSuspenseQuery(historyQuery(range));
  const { rows, series } = useMemo(() => toMonthlySpend(data), [data]);
  const keys = useMemo(() => series.map((s) => s.key), [series]);
  const cur = data.baseCurrency;
  const fmt = (n: number) => money(n, cur);
  const fmtAxis = (n: number) => money(n, cur, { cents: false });
  const reimbursed = data.reimbursed.reduce((sum, v) => sum + v, 0);
  const spent = data.totals.reduce((sum, v) => sum + v, 0);
  const span = range === "ytd" ? "year to date" : "last 12 months";
  return (
    <ChartCard
      title="Monthly recurring spend"
      description={`${money(spent, cur)} ${span}, stacked by subscription${reimbursed > 0 ? ` · ${money(reimbursed, cur)} reimbursed` : ""}`}
      className={cn(CHART_SLOT.spend, isPending && "opacity-60 transition-opacity")}
      controls={<RangeToggle label="Spend range" value={range} onChange={(r) => setParams({ range: r === "12m" ? null : r })} />}
    >
      <SpendColumns
        data={rows}
        keys={keys}
        series={series}
        height={300}
        formatValue={fmt}
        formatAxisValue={fmtAxis}
        formatMonth={monthLabel}
        formatMonthLong={monthYearLabel}
      />
    </ChartCard>
  );
}

export function RenewalsSection() {
  const [isPending, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(overviewParams, { startTransition });
  const { data } = useSuspenseQuery(subscriptionsQuery());
  const [view, setView] = useRenewalView();
  // Only forward from this month, a month at a time.
  const ahead = Math.min(Math.max(params.ahead, 0), RENEWAL_MONTHS_AHEAD);
  const monthStart = addMonths(`${data.today.slice(0, 7)}-01`, ahead);
  const month = monthStart.slice(0, 7);
  const charges = useMemo(
    () => projectChargesBetween(data.subscriptions, ahead === 0 ? data.today : monthStart, addMonths(monthStart, 1)),
    [data, ahead, monthStart],
  );
  const total = charges.filter((c) => c.currency === data.baseCurrency).reduce((s, c) => s + c.amount, 0);
  const go = (n: number) => setParams({ ahead: n || null });
  const when = ahead === 0 ? "still to come this month" : `in ${monthYearLabel(month)}`;
  return (
    <ChartCard
      title="Upcoming renewals"
      description={`${charges.length} charge${charges.length === 1 ? "" : "s"} · ${money(total, data.baseCurrency)} ${when}`}
      className={cn(CHART_SLOT.renewals, isPending && "opacity-60 transition-opacity")}
      controls={
        <>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              className="pointer-coarse:size-11"
              aria-label="Previous month"
              disabled={ahead === 0}
              onClick={() => go(ahead - 1)}
            >
              <ChevronLeftIcon />
            </Button>
            <span className="w-20 text-center text-[12.5px] font-medium tabular-nums" aria-live="polite">
              {monthYearLabel(month)}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              className="pointer-coarse:size-11"
              aria-label="Next month"
              disabled={ahead >= RENEWAL_MONTHS_AHEAD}
              onClick={() => go(ahead + 1)}
            >
              <ChevronRightIcon />
            </Button>
          </div>
          <RenewalViewToggle value={view} onChange={setView} />
        </>
      }
    >
      {/* Phones choose between the two (List by default, remembered per device); md and up always get the grid. */}
      <div className={cn(view === "list" && "hidden md:block")}>
        <RenewalCalendar
          charges={charges}
          today={data.today}
          month={month}
          formatMoney={(a, c) => money(a, c, { cents: false })}
          formatAmount={money}
          formatDate={fullDate}
        />
      </div>
      <div className={cn("md:hidden", view === "calendar" && "hidden")}>
        <RenewalAgenda
          charges={charges}
          today={data.today}
          emptyLabel={
            ahead === 0 ? "Nothing else expected to charge this month." : `Nothing expected to charge in ${monthYearLabel(month)}.`
          }
        />
      </div>
    </ChartCard>
  );
}

export function TimelineSection() {
  const router = useRouter();
  const { data } = useSuspenseQuery(subscriptionsQuery());
  // Live subscriptions first, then by first-seen date (stable order).
  const rows = useMemo(
    () => [...data.subscriptions].sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || a.firstCharge.localeCompare(b.firstCharge)),
    [data],
  );
  if (!rows.length) return null;
  return (
    <ChartCard title="Subscription timeline" description="Each tick is a charge; ringed dots mark price changes">
      <SubscriptionTimeline
        data={rows}
        today={data.today}
        formatMoney={money}
        formatDate={fullDate}
        formatTick={(d) => monthYearLabel(d.toISOString().slice(0, 7))}
        onSelect={(key) => router.push(drawerHref(key))}
      />
    </ChartCard>
  );
}

const merchantKey = (d: MerchantSpend) => d.merchantKey;
const merchantName = (d: MerchantSpend) => d.name;
const merchantTotal = (d: MerchantSpend) => d.total;
const merchantSubsidised = (d: MerchantSpend) => d.subsidised;

export function MerchantSection() {
  const [isPending, startTransition] = useTransition();
  const [{ range }, setParams] = useQueryStates(overviewParams, { startTransition });
  const { data } = useSuspenseQuery(subscriptionsQuery());
  const merchants = useMemo(() => spendByMerchant(data, range), [data, range]);
  if (!data.subscriptions.length) return null;
  const cur = data.baseCurrency;
  const fmt = (n: number) => money(n, cur, { cents: false });
  const total = merchants.reduce((sum, m) => sum + m.total, 0);
  const subsidised = merchants.reduce((sum, m) => sum + m.subsidised, 0);
  const span = range === "ytd" ? "this year" : "over the last 12 months";
  return (
    <ChartCard
      title="Spend by merchant"
      description={`${money(total - subsidised, cur)} paid by you ${span}${subsidised > 0 ? ` · ${money(subsidised, cur)} subsidised` : ""}`}
      className={cn(isPending && "opacity-60 transition-opacity")}
      controls={<RangeToggle label="Merchant range" value={range} onChange={(r) => setParams({ range: r === "12m" ? null : r })} />}
    >
      {merchants.length ? (
        <SpendByMerchant
          data={merchants}
          getKey={merchantKey}
          getLabel={merchantName}
          getValue={merchantTotal}
          getSubsidised={merchantSubsidised}
          formatValue={fmt}
          formatAxisValue={fmt}
        />
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">No subscription charges yet this year.</p>
      )}
    </ChartCard>
  );
}
