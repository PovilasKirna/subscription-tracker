"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { ChartCard, InvestmentLine } from "@/charts";
import { MerchantIcon } from "@/components/MerchantIcon";
import { ChartCardSkeleton } from "@/components/overview/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/bank";
import { fullDate, money, shortDate } from "@/lib/format";
import { investmentsQuery, netWorthQuery } from "@/lib/query/options";
import type { BrokerPosition, InvestmentsPayload } from "@/lib/types";
import { SourceCard } from "./NetWorthView";
import { Delta, Percent, type Range, RangeToggle, sliceRange } from "./shared";

const RANGES: Range[] = [
  { id: "1w", label: "1W", days: 7 },
  { id: "1m", label: "1M", days: 30 },
  { id: "3m", label: "3M", days: 91 },
  { id: "ytd", label: "YTD", days: "ytd" },
  { id: "1y", label: "1Y", days: 365 },
  { id: "max", label: "Max", days: null },
];

export function InvestmentsView() {
  const { data } = useSuspenseQuery(investmentsQuery());
  const { data: nw } = useSuspenseQuery(netWorthQuery());
  const h = data.holding;
  if (!data.configured || !h || h.value === null) {
    return (
      <div className="flex flex-col gap-4">
        {h?.error && <ErrorNote message={h.error} />}
        <div className="max-w-xl">
          <SourceCard data={nw} kind="broker" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {h.error && <ErrorNote message={h.error} />}
      <ValueCard data={data} />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.55fr]">
        <BreakdownCard data={data} />
        <PositionsCard data={data} />
      </div>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-2 text-sm">
        <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-[var(--status-warning)]" aria-hidden />
        {message}
      </CardContent>
    </Card>
  );
}

// ---------- value over time ----------

function ValueCard({ data }: { data: InvestmentsPayload }) {
  const [range, setRange] = useState("3m");
  const h = data.holding;
  const cur = h?.currency ?? data.baseCurrency;
  const r = RANGES.find((x) => x.id === range) ?? RANGES[2];
  const points = useMemo(() => sliceRange(data.history, r, data.today), [data.history, r, data.today]);
  // Return over the range: the change in value minus what was paid in meanwhile (deposits aren't
  // gains). Only with the full deposit history: without it a deposit would look like profit.
  const tracked = points.filter((p) => p.value !== null);
  const start = tracked[0];
  const end = tracked.at(-1);
  const periodReturn =
    data.deposits.complete && start && end && start !== end && start.deposits !== null && end.deposits !== null
      ? (end.value ?? 0) - (start.value ?? 0) - (end.deposits - start.deposits)
      : null;
  return (
    <ChartCard
      title="Account value"
      description={
        // "x min ago" can tick over between server render and hydration.
        <span suppressHydrationWarning>
          Trading 212 · {h?.name}
          {h?.asOf && ` · updated ${timeAgo(h.asOf)}`}
        </span>
      }
    >
      <div className="-mt-2 mb-4 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="text-5xl font-semibold tracking-tight tabular-nums">{money(h?.value ?? 0, cur)}</div>
        <Stat label={`Return${start ? ` since ${fullDate(start.date)}` : ""}`}>
          {periodReturn !== null ? <Delta value={periodReturn} currency={cur} icon /> : <span className="text-muted-foreground">—</span>}
        </Stat>
        <Stat label="Rate of return">
          {data.returnRate !== null ? <Percent value={data.returnRate} /> : <span className="text-muted-foreground">—</span>}
        </Stat>
        <Stat label="Net deposits">
          <span className="font-medium tabular-nums">{data.netDeposits !== null ? money(data.netDeposits, cur) : "—"}</span>
        </Stat>
      </div>
      {data.deposits.error ? (
        <p className="mb-3 flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
          <CircleAlertIcon className="size-3.5 text-[var(--status-warning)]" aria-hidden /> {data.deposits.error}
        </p>
      ) : (
        data.deposits.synced &&
        !data.deposits.complete && (
          <p className="mb-3 text-[13px] text-[var(--text-muted)]">
            Still reading your deposit history from Trading 212 — return and net deposits appear once it's all in.
          </p>
        )
      )}
      {points.length >= 2 && points.some((p) => p.value !== null) ? (
        <InvestmentLine
          data={points}
          height={280}
          formatValue={(n) => money(n, cur)}
          formatAxisValue={(n) => money(n, cur, { cents: false, compact: Math.abs(n) >= 100_000 })}
          formatDate={shortDate}
          formatDateLong={fullDate}
        />
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          The account value is recorded every day from now on, so the chart fills in from tomorrow.
        </p>
      )}
      {/* Below the chart (as in the Trading 212 app), so the card's title has room on phones. */}
      <div className="mt-3 flex justify-center">
        <RangeToggle ranges={RANGES} value={range} onChange={setRange} />
      </div>
      {data.history.some((p) => p.value === null) && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          The value line starts on {fullDate(data.history.find((p) => p.value !== null)?.date ?? data.today)}, when tracking began; deposits
          go back further.
        </p>
      )}
    </ChartCard>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-sm">
      <div className="text-xs tracking-wide text-[var(--text-muted)] uppercase">{label}</div>
      <div className="mt-0.5 text-base">{children}</div>
    </div>
  );
}

// ---------- breakdown & positions ----------

function BreakdownCard({ data }: { data: InvestmentsPayload }) {
  const h = data.holding;
  const b = h?.broker;
  const cur = h?.currency ?? data.baseCurrency;
  if (!b) return null;
  const rows: [string, React.ReactNode][] = [
    ["Invested (current value)", money(b.invested, cur)],
    ["Cost of current positions", b.cost !== null ? money(b.cost, cur) : "—"],
    ["Unrealised profit / loss", b.profitLoss !== null ? <Delta key="u" value={b.profitLoss} currency={cur} /> : "—"],
    [
      "Realised profit / loss (all time)",
      b.realizedProfitLoss != null ? <Delta key="r" value={b.realizedProfitLoss} currency={cur} /> : "—",
    ],
    ["Free cash", money(b.cash, cur)],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Breakdown</CardTitle>
        <CardDescription>Cash plus the current value of your shares makes the account value.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col divide-y text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 py-2">
              <dt className="text-[var(--text-secondary)]">{label}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function PositionsCard({ data }: { data: InvestmentsPayload }) {
  const [showAll, setShowAll] = useState(false);
  const h = data.holding;
  const positions = h?.broker?.positions ?? null;
  const cur = h?.currency ?? data.baseCurrency;
  const total = positions?.reduce((s, p) => s + p.value, 0) ?? 0;
  const visible = positions ? (showAll ? positions : positions.slice(0, 8)) : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Positions</CardTitle>
        <CardDescription>
          {positions ? `${positions.length} holding${positions.length === 1 ? "" : "s"}, largest first` : "Not available"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {positions === null ? (
          <p className="text-sm text-muted-foreground">Give the API key the “Portfolio” permission to see your positions.</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y">
              {visible.map((p) => (
                <PositionRow key={p.ticker} p={p} currency={cur} share={total > 0 ? p.value / total : 0} />
              ))}
            </ul>
            {positions.length > 8 && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show fewer" : `Show all ${positions.length}`}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** "AAPL_US_EQ" → "AAPL"; "VUAAm_EQ" → "VUAA". */
const shortTicker = (t: string) => t.split("_")[0].replace(/[a-z]+$/, "");

function PositionRow({ p, currency, share }: { p: BrokerPosition; currency: string; share: number }) {
  const rate = p.profitLoss !== null && p.cost ? p.profitLoss / p.cost : null;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <MerchantIcon name={p.name} website={null} />
      <div className="min-w-0">
        <div className="truncate font-medium">{p.name}</div>
        <div className="text-xs text-[var(--text-muted)]">
          {shortTicker(p.ticker)} · {Math.round(share * 100)}% of portfolio
        </div>
      </div>
      <div className="ml-auto text-right">
        <div className="font-semibold tabular-nums">{money(p.value, currency)}</div>
        <div className="text-xs">
          {p.profitLoss !== null ? <Delta value={p.profitLoss} currency={currency} /> : null}
          {rate !== null && (
            <span className="ml-1">
              (<Percent value={rate} />)
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

export function InvestmentsViewSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <ChartCardSkeleton height={340} />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.55fr]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
