"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  KeyRoundIcon,
  LandmarkIcon,
  Loader2Icon,
  PiggyBankIcon,
  RefreshCwIcon,
  TrendingUpIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChartCard, NetWorthLine } from "@/charts";
import { ChartCardSkeleton } from "@/components/overview/skeletons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/bank";
import { fullDate, money, shortDate } from "@/lib/format";
import { useRefreshNetWorth } from "@/lib/query/mutations";
import { netWorthQuery } from "@/lib/query/options";
import type { Holding, HoldingGroup, HoldingKind, NetWorthPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Delta, type Range, RangeToggle, sliceRange } from "./shared";

const RANGES: Range[] = [
  { id: "1w", label: "1W", days: 7 },
  { id: "1m", label: "1M", days: 30 },
  { id: "6m", label: "6M", days: 182 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "max", label: "Max", days: null },
];

const GROUP_META: Record<HoldingGroup, { label: string; icon: typeof WalletIcon; noun: string }> = {
  savings: { label: "Savings", icon: PiggyBankIcon, noun: "account" },
  cash: { label: "Cash", icon: WalletIcon, noun: "account" },
  investments: { label: "Investments", icon: TrendingUpIcon, noun: "portfolio" },
};
const GROUP_ORDER: HoldingGroup[] = ["savings", "cash", "investments"];

export const holdingHref = (id: string) => `/net-worth/${encodeURIComponent(id)}`;

export function RefreshButton() {
  const { data } = useSuspenseQuery(netWorthQuery());
  const refresh = useRefreshNetWorth();
  const { bankConnected, trading212Configured } = data.sources;
  if (!bankConnected && !trading212Configured) return null;
  return (
    <Button variant="outline" size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
      {refresh.isPending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
      {refresh.isPending ? "Refreshing…" : "Refresh"}
    </Button>
  );
}

export function NetWorthView() {
  const { data } = useSuspenseQuery(netWorthQuery());
  if (!data.holdings.length) return <SetupSources data={data} />;
  const missing = (["bank", "broker"] as HoldingKind[]).filter((k) => !data.holdings.some((h) => h.kind === k));
  return (
    <div className="flex flex-col gap-4">
      {data.unconverted.length > 0 && (
        <Card>
          <CardContent className="flex items-center gap-2 text-sm">
            <CircleAlertIcon className="size-4 shrink-0 text-[var(--status-warning)]" aria-hidden />
            No exchange rate yet for {data.unconverted.join(", ")} — those accounts are left out of the totals until one is fetched.
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <TotalCard data={data} />
        <AccountsCard data={data} />
      </div>
      {missing.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {missing.map((k) => (
            <SourceCard key={k} data={data} kind={k} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- total ----------

function TotalCard({ data }: { data: NetWorthPayload }) {
  const [range, setRange] = useState("1m");
  const r = RANGES.find((x) => x.id === range) ?? RANGES[1];
  const points = useMemo(() => sliceRange(data.history, r, data.today), [data.history, r, data.today]);
  const cur = data.baseCurrency;
  const first = points[0];
  const change = first && points.length > 1 ? data.total - first.total : null;
  const split = data.byKind.bank !== 0 && data.byKind.broker !== 0;
  return (
    <ChartCard title="Total assets">
      <div className="-mt-1 text-5xl font-semibold tracking-tight tabular-nums">{money(data.total, cur)}</div>
      <div className="mt-1.5 mb-4 text-[13px] text-[var(--text-muted)]">
        {change !== null ? (
          <>
            <Delta value={change} currency={cur} pct={first.total ? change / Math.abs(first.total) : null} cents={false} icon /> since{" "}
            {fullDate(first.date)}
          </>
        ) : (
          `across ${data.holdings.length} account${data.holdings.length === 1 ? "" : "s"}`
        )}
      </div>
      {data.history.length >= 2 ? (
        <NetWorthLine
          data={points.length >= 2 ? points : data.history.slice(-2)}
          split={split}
          height={260}
          formatValue={(n) => money(n, cur)}
          formatAxisValue={(n) => money(n, cur, { cents: false, compact: Math.abs(n) >= 100_000 })}
          formatDate={shortDate}
          formatDateLong={fullDate}
        />
      ) : (
        <div className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-8 text-center">
          <TrendingUpIcon className="size-5 text-muted-foreground" aria-hidden />
          <div className="font-medium">Your history starts {data.history[0] ? fullDate(data.history[0].date) : "today"}</div>
          <p className="max-w-sm text-sm text-muted-foreground">
            Balances are recorded once a day as your accounts sync, so the chart fills in from tomorrow.
          </p>
        </div>
      )}
      {data.history.length >= 2 && (
        <div className="mt-3 flex justify-center">
          <RangeToggle ranges={RANGES} value={range} onChange={setRange} />
        </div>
      )}
    </ChartCard>
  );
}

// ---------- accounts by group ----------

function AccountsCard({ data }: { data: NetWorthPayload }) {
  const groups = GROUP_ORDER.map((g) => ({ g, holdings: data.holdings.filter((h) => h.group === g) })).filter((x) => x.holdings.length);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Accounts</CardTitle>
        <CardDescription>
          Accounts switched off in{" "}
          <Link href="/settings/data" className="underline underline-offset-2">
            Settings → Data
          </Link>{" "}
          aren't counted.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {groups.map(({ g, holdings }) => (
          <GroupRow key={g} group={g} holdings={holdings} data={data} />
        ))}
      </CardContent>
    </Card>
  );
}

function GroupRow({ group, holdings, data }: { group: HoldingGroup; holdings: Holding[]; data: NetWorthPayload }) {
  const [open, setOpen] = useState(group !== "investments" && holdings.length <= 3);
  const meta = GROUP_META[group];
  const Icon = meta.icon;
  const amount = data.byGroup[group];
  const share = data.total > 0 ? amount / data.total : 0;
  const problems = holdings.filter((h) => h.error || h.stale).length;
  const head = (
    <>
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-[var(--text-secondary)]">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 text-left">
        <span className="block font-medium">{meta.label}</span>
        <span className="block text-xs text-[var(--text-muted)]">
          {holdings.length} {meta.noun}
          {holdings.length === 1 ? "" : "s"}
          {problems > 0 && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 text-[var(--text-secondary)]">
              <CircleAlertIcon className="size-3 text-[var(--status-warning)]" aria-hidden /> {problems} need{problems === 1 ? "s" : ""}{" "}
              attention
            </span>
          )}
        </span>
      </span>
      <span className="ml-auto text-right">
        <span className="block font-semibold tabular-nums">{money(amount, data.baseCurrency)}</span>
        <span className="block text-xs text-[var(--text-muted)] tabular-nums">{Math.round(share * 100)}%</span>
      </span>
    </>
  );
  // Investments open their own page; cash and savings expand into their accounts.
  if (group === "investments") {
    return (
      <Link href="/investments" className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted">
        {head}
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted"
      >
        {head}
        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} aria-hidden />
      </button>
      {open && (
        <ul className="mt-0.5 mb-1 ml-[1.375rem] flex flex-col border-l pl-4">
          {holdings.map((h) => (
            <li key={h.id}>
              <Link href={holdingHref(h.id)} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <span className="min-w-0">
                  <span className="block truncate">
                    {h.name} <span className="text-[var(--text-muted)]">· {h.institution}</span>
                  </span>
                  {/* "x min ago" can tick over between server render and hydration. */}
                  <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]" suppressHydrationWarning>
                    {(h.error || h.stale) && <CircleAlertIcon className="size-3 text-[var(--status-warning)]" aria-hidden />}
                    {h.error ? "Last update failed" : h.asOf ? `Updated ${timeAgo(h.asOf)}` : "Not fetched yet"}
                  </span>
                </span>
                <span className="ml-auto text-right">
                  <span className="block font-medium tabular-nums">
                    {h.value !== null && h.currency ? money(h.value, h.currency) : "—"}
                  </span>
                  {h.currency && h.currency !== data.baseCurrency && h.baseValue !== null && (
                    <span className="block text-xs text-[var(--text-muted)] tabular-nums">≈ {money(h.baseValue, data.baseCurrency)}</span>
                  )}
                </span>
                <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- setup ----------

function SetupSources({ data }: { data: NetWorthPayload }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <div className="font-medium">Track what you have, not just what you spend</div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Connect your bank and your Trading 212 account. Their balances are recorded every day, so you can see your net worth grow over
            time.
          </p>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <SourceCard data={data} kind="bank" />
        <SourceCard data={data} kind="broker" />
      </div>
    </div>
  );
}

export function SourceCard({ data, kind }: { data: Pick<NetWorthPayload, "sources">; kind: HoldingKind }) {
  const refresh = useRefreshNetWorth();
  const { bankConfigured, bankConnected, trading212Configured } = data.sources;
  if (kind === "bank") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LandmarkIcon className="size-4 text-muted-foreground" aria-hidden /> Bank accounts
          </CardTitle>
          <CardDescription>
            {bankConnected
              ? "Your bank is connected — balances are fetched on the next sync."
              : "Connect Revolut (via Enable Banking) and each account's balance is fetched during sync."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bankConnected ? (
            <Button variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              {refresh.isPending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Fetch balances now
            </Button>
          ) : (
            <Link href="/settings/data" className={buttonVariants({ variant: bankConfigured ? "default" : "outline" })}>
              {bankConfigured ? "Connect your bank" : "Set up bank sync"}
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUpIcon className="size-4 text-muted-foreground" aria-hidden /> Trading 212
        </CardTitle>
        <CardDescription>
          {trading212Configured ? (
            <span className="inline-flex items-center gap-1.5">
              <CircleCheckIcon className="size-3.5 text-[var(--status-good)]" aria-hidden /> API key set — fetch your account to start
              tracking it.
            </span>
          ) : (
            "Read-only access with a Trading 212 API key: your account value, cash, positions and deposits."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {trading212Configured ? (
          <Button variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            {refresh.isPending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Fetch now
          </Button>
        ) : (
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-[var(--text-secondary)]">
            <li>
              In the Trading 212 app, open <b>Settings → API</b> and generate a key.
            </li>
            <li>
              Allow only <b>Account data</b>, <b>Portfolio</b> and <b>History</b> — no trading permissions are needed.
            </li>
            <li>
              <span className="inline-flex items-center gap-1">
                <KeyRoundIcon className="size-3.5" aria-hidden /> Set
              </span>{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">TRADING212_API_KEY</code> and{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">TRADING212_API_SECRET</code> on the server (Vercel → Environment
              Variables) and redeploy.
            </li>
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function NetWorthViewSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
      <ChartCardSkeleton height={320} />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
