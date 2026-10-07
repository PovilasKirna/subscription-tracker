"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, ChevronRightIcon, CircleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChartCard, NetWorthLine } from "@/charts";
import { MerchantIcon } from "@/components/MerchantIcon";
import { ChartCardSkeleton } from "@/components/overview/skeletons";
import { PageHeader } from "@/components/shell/PageHeader";
import { CategoryIcon } from "@/components/spending/CategoryIcon";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/bank";
import { CATEGORIES } from "@/lib/categories";
import { fullDate, money, shortDate } from "@/lib/format";
import { holdingQuery } from "@/lib/query/options";
import type { HoldingDetailPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Delta, type Range, RangeToggle, sliceRange } from "./shared";

const RANGES: Range[] = [
  { id: "1m", label: "1M", days: 30 },
  { id: "6m", label: "6M", days: 182 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "max", label: "Max", days: null },
];

const GROUP_LABEL = { cash: "Cash", savings: "Savings", investments: "Investments" } as const;

/** One account from the Net worth page: its balance over time and its latest payments. */
export function HoldingView({ id }: { id: string }) {
  const { data } = useSuspenseQuery(holdingQuery(id));
  const { holding: h } = data;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`${h.name} · ${h.institution}`}
        actions={
          <Link href="/net-worth" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground")}>
            <ArrowLeftIcon /> Net worth
          </Link>
        }
      />
      {/* "x min ago" can tick over between server render and hydration. */}
      <div className="-mt-2 text-sm text-muted-foreground" suppressHydrationWarning>
        <span className="font-medium text-foreground md:hidden">{h.name} · </span>
        {h.institution} · {GROUP_LABEL[h.group]} · {h.asOf ? `updated ${timeAgo(h.asOf)}` : "not fetched yet"}
      </div>
      {h.error && (
        <Card>
          <CardContent className="flex items-start gap-2 text-sm">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-[var(--status-warning)]" aria-hidden />
            {h.error}
          </CardContent>
        </Card>
      )}
      <BalanceCard data={data} />
      {h.kind === "broker" ? (
        <Link href="/investments" className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm hover:bg-muted">
          See positions, deposits and return on the Investments page
          <ChevronRightIcon className="ml-auto size-4 text-muted-foreground" aria-hidden />
        </Link>
      ) : (
        <PaymentsCard data={data} />
      )}
    </div>
  );
}

function BalanceCard({ data }: { data: HoldingDetailPayload }) {
  const [range, setRange] = useState("6m");
  const { holding: h } = data;
  const cur = h.currency ?? data.baseCurrency;
  const r = RANGES.find((x) => x.id === range) ?? RANGES[1];
  const points = useMemo(
    () => sliceRange(data.history, r, data.today).map((d) => ({ date: d.date, total: d.value, bank: 0, broker: 0 })),
    [data.history, r, data.today],
  );
  const first = points[0];
  const change = first && points.length > 1 && h.value !== null ? h.value - first.total : null;
  return (
    <ChartCard
      title="Balance"
      description={
        change !== null ? (
          <>
            <Delta value={change} currency={cur} cents={false} icon /> since {fullDate(first.date)}
          </>
        ) : undefined
      }
      controls={data.history.length >= 2 ? <RangeToggle ranges={RANGES} value={range} onChange={setRange} /> : undefined}
    >
      <div className="-mt-2 mb-4">
        <span className="text-4xl font-semibold tracking-tight tabular-nums">{h.value !== null ? money(h.value, cur) : "—"}</span>
        {h.currency && h.currency !== data.baseCurrency && h.baseValue !== null && (
          <span className="ml-2 text-sm text-[var(--text-muted)] tabular-nums">≈ {money(h.baseValue, data.baseCurrency)}</span>
        )}
      </div>
      {points.length >= 2 ? (
        <NetWorthLine
          data={points}
          split={false}
          height={240}
          formatValue={(n) => money(n, cur)}
          formatAxisValue={(n) => money(n, cur, { cents: false, compact: Math.abs(n) >= 100_000 })}
          formatDate={shortDate}
          formatDateLong={fullDate}
        />
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          The balance is recorded once a day, so the chart fills in from tomorrow.
        </p>
      )}
    </ChartCard>
  );
}

function PaymentsCard({ data }: { data: HoldingDetailPayload }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Latest payments</CardTitle>
        <CardAction>
          <Link href="/transactions?source=bank" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            All transactions <ChevronRightIcon />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {data.transactions.length ? (
          <ul className="flex flex-col divide-y">
            {data.transactions.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <MerchantIcon name={t.merchantKey.replace(/-/g, " ")} website={t.website} size="sm" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{t.description}</div>
                  <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <CategoryIcon id={t.category} size="sm" className="size-4 bg-transparent [&_svg]:size-3" />
                    {CATEGORIES[t.category].label} · {fullDate(t.date)}
                  </div>
                </div>
                <span className={cn("ml-auto text-sm font-medium tabular-nums", t.amount > 0 && "text-[var(--delta-good)]")}>
                  {t.amount > 0 ? "+" : ""}
                  {money(t.amount, t.currency)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No synced payments for this account. Payments imported from a CSV statement aren't linked to an account.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function HoldingViewSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-16 w-64" />
      <ChartCardSkeleton height={300} />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
