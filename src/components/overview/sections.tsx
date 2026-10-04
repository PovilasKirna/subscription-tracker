"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { UploadIcon } from "lucide-react";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { useMemo, useTransition } from "react";
import {
  ChartCard,
  type MonthlySpend,
  RenewalCalendar,
  RenewalCalendarTable,
  type SeriesMeta,
  SpendByMerchant,
  SpendByMerchantTable,
  SpendColumns,
  SpendColumnsTable,
  SubscriptionTimeline,
  SubscriptionTimelineTable,
} from "@/charts";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fullDate, money, monthLabel, monthYearLabel } from "@/lib/format";
import { isLive, type MerchantSpend, projectCharges, spendByMerchant } from "@/lib/insights";
import { historyQuery, subscriptionsQuery } from "@/lib/query/options";
import { HISTORY_RANGES, overviewParams, RENEWAL_WINDOWS } from "@/lib/search-params";
import type { HistoryPayload } from "@/lib/types";
import { cn } from "@/lib/utils";

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

function RangeToggle<V extends number>({
  value,
  options,
  suffix,
  onChange,
  label,
}: {
  value: V;
  options: readonly V[];
  suffix: string;
  onChange: (v: V) => void;
  label: string;
}) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      value={[String(value)]}
      onValueChange={(v: string[]) => v[0] && onChange(Number(v[0]) as V)}
      aria-label={label}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o} value={String(o)} className="px-2 text-xs">
          {o}
          {suffix}
        </ToggleGroupItem>
      ))}
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
        <Link href="/data" className={buttonVariants()}>
          <UploadIcon /> Import data
        </Link>
      </CardContent>
    </Card>
  );
}

export function SpendSection() {
  const [isPending, startTransition] = useTransition();
  const [{ months }, setParams] = useQueryStates(overviewParams, { startTransition });
  const { data } = useSuspenseQuery(historyQuery(months));
  const { rows, series } = useMemo(() => toMonthlySpend(data), [data]);
  const keys = useMemo(() => series.map((s) => s.key), [series]);
  const cur = data.baseCurrency;
  const fmt = (n: number) => money(n, cur);
  const fmtAxis = (n: number) => money(n, cur, { cents: false });
  return (
    <ChartCard
      title="Monthly recurring spend"
      description={`Stacked by subscription, last ${months} months`}
      className={cn(isPending && "opacity-60 transition-opacity")}
      controls={<RangeToggle label="Range" value={months} options={HISTORY_RANGES} suffix="m" onChange={(m) => setParams({ months: m })} />}
      chart={
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
      }
      table={<SpendColumnsTable data={rows} series={series} formatValue={fmt} formatMonthLong={monthYearLabel} />}
    />
  );
}

export function RenewalsSection() {
  const [isPending, startTransition] = useTransition();
  const [{ days }, setParams] = useQueryStates(overviewParams, { startTransition });
  const { data } = useSuspenseQuery(subscriptionsQuery());
  const charges = useMemo(() => projectCharges(data.subscriptions, data.today, days), [data, days]);
  const total = charges.filter((c) => c.currency === data.baseCurrency).reduce((s, c) => s + c.amount, 0);
  return (
    <ChartCard
      title="Upcoming renewals"
      description={`${charges.length} charges · ${money(total, data.baseCurrency)} in the next ${days} days`}
      className={cn(isPending && "opacity-60 transition-opacity")}
      controls={<RangeToggle label="Window" value={days} options={RENEWAL_WINDOWS} suffix="d" onChange={(d) => setParams({ days: d })} />}
      chart={
        <RenewalCalendar
          charges={charges}
          today={data.today}
          days={days}
          formatMoney={(a, c) => money(a, c, { cents: false })}
          formatDate={fullDate}
        />
      }
      table={<RenewalCalendarTable charges={charges} formatMoney={money} formatDate={fullDate} />}
    />
  );
}

export function TimelineSection() {
  const { data } = useSuspenseQuery(subscriptionsQuery());
  // Live subscriptions first, then by first-seen date (stable order).
  const rows = useMemo(
    () => [...data.subscriptions].sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || a.firstCharge.localeCompare(b.firstCharge)),
    [data],
  );
  if (!rows.length) return null;
  return (
    <ChartCard
      title="Subscription timeline"
      description="Each tick is a charge; ringed dots mark price changes"
      chart={
        <SubscriptionTimeline
          data={rows}
          today={data.today}
          formatMoney={money}
          formatDate={fullDate}
          formatTick={(d) => monthYearLabel(d.toISOString().slice(0, 7))}
        />
      }
      table={<SubscriptionTimelineTable data={rows} formatMoney={money} formatDate={fullDate} />}
    />
  );
}

const merchantKey = (d: MerchantSpend) => d.merchantKey;
const merchantName = (d: MerchantSpend) => d.name;
const merchantTotal = (d: MerchantSpend) => d.total;

export function MerchantSection() {
  const { data } = useSuspenseQuery(subscriptionsQuery());
  const merchants = useMemo(() => spendByMerchant(data, 12), [data]);
  if (!merchants.length) return null;
  const fmt = (n: number) => money(n, data.baseCurrency, { cents: false });
  return (
    <ChartCard
      title="Spend by merchant"
      description="Subscription charges, last 12 months"
      chart={
        <SpendByMerchant
          data={merchants}
          getKey={merchantKey}
          getLabel={merchantName}
          getValue={merchantTotal}
          formatValue={fmt}
          formatAxisValue={fmt}
        />
      }
      table={
        <SpendByMerchantTable
          data={merchants}
          getKey={merchantKey}
          getLabel={merchantName}
          getValue={merchantTotal}
          formatValue={(n) => money(n, data.baseCurrency)}
        />
      }
    />
  );
}
