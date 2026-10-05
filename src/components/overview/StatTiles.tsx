"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CircleAlertIcon, ClockAlertIcon, TrendingUpIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { fullDate, money } from "@/lib/format";
import { computeStats, isLive } from "@/lib/insights";
import { subscriptionsQuery } from "@/lib/query/options";
import { cn } from "@/lib/utils";
import { drawerHref } from "./links";

// Stat tiles: plain HTML, no chart library. Proportional figures for the big numbers.
// Type roles from DESIGN.md: Display 48px (the one hero), Stat 26px, Body 14px, Label 12.5px.

const linkClass =
  "rounded-sm text-muted-foreground underline decoration-foreground/30 underline-offset-2 hover:text-foreground hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring";

/** The monthly total: the Overview's one Display-size figure. */
export function MonthlyTotalTile() {
  const { data } = useSuspenseQuery(subscriptionsQuery());
  const s = computeStats(data);
  const cur = data.baseCurrency;
  return (
    <Card>
      {/* A container, so the figure steps down to 36px when the tile is a quarter of a laptop-width row. */}
      <CardContent className="@container/hero flex flex-1 flex-col">
        <div className="text-sm text-muted-foreground">Monthly total</div>
        <div className="mt-2 text-4xl leading-none font-semibold tracking-tight @min-[15rem]/hero:text-5xl">
          {money(s.monthly, cur)}
          {/* "/mo" may wrap under a large figure rather than overflow the tile. */}
          <wbr />
          <span className="ml-1 text-base font-medium tracking-normal text-muted-foreground">/mo</span>
        </div>
        <div className="mt-3 flex flex-col gap-1 text-[12.5px] leading-snug text-muted-foreground lg:mt-auto lg:pt-3">
          <p>
            {s.reimbursedMonthly > 0 && `after ${money(s.reimbursedMonthly, cur)} reimbursed · `}
            {money(s.dueNext30, cur)} due in the next 30 days
          </p>
          {s.pendingReimbursements > 0 && (
            <p className="flex items-center gap-1.5">
              <CircleAlertIcon className="size-3.5 shrink-0 text-[var(--status-warning)]" aria-hidden />
              {s.pendingReimbursements} pending reimbursement{s.pendingReimbursements > 1 ? "s" : ""}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** The yearly projection at today's prices. */
export function YearlyTile() {
  const { data } = useSuspenseQuery(subscriptionsQuery());
  const s = computeStats(data);
  return (
    <Tile
      label="Yearly projection"
      value={money(s.yearly, data.baseCurrency, { cents: false })}
      sub={s.reimbursedMonthly > 0 ? "at today's prices, after reimbursements" : "at today's prices"}
    />
  );
}

/** The active count, naming what's overdue. */
export function ActiveTile() {
  const { data } = useSuspenseQuery(subscriptionsQuery());
  const s = computeStats(data);
  const cur = data.baseCurrency;
  // Same set computeStats counts: live, in the base currency.
  const late = data.subscriptions.filter((x) => isLive(x) && x.currency === cur && x.status === "late").map((x) => x.name);
  return (
    <Tile
      label="Active subscriptions"
      value={String(s.activeCount + s.lateCount)}
      sub={
        late.length ? (
          <span className="flex items-start gap-1.5 text-muted-foreground">
            <ClockAlertIcon className="mt-[3px] size-3.5 shrink-0 text-[var(--status-warning)]" aria-hidden />
            <Link href="/subscriptions?status=late" className={linkClass}>
              {overdueLine(late)}
            </Link>
          </span>
        ) : (
          "all charging on schedule"
        )
      }
    />
  );
}

/** The biggest price increase in the last 12 months; the whole tile opens that subscription. */
export function PriceIncreaseTile() {
  const { data } = useSuspenseQuery(subscriptionsQuery());
  const inc = computeStats(data).biggestIncrease;
  const incKey = inc?.key ?? null;
  return (
    <Tile
      className={cn(
        incKey && "relative transition-colors has-[a:hover]:bg-muted/40 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring",
      )}
      label="Biggest price increase"
      value={inc ? `+${Math.round(inc.pct * 100)}%` : "None"}
      valueClass={inc ? "text-[var(--delta-bad)]" : undefined}
      icon={inc ? <TrendingUpIcon className="size-5 text-[var(--delta-bad)]" aria-hidden /> : null}
      sub={
        inc && incKey ? (
          // Stretched link: the whole tile opens the subscription; the name stays the link text.
          <Link
            href={drawerHref(incKey)}
            className="rounded-sm text-muted-foreground underline decoration-foreground/30 underline-offset-2 outline-none after:absolute after:inset-0 after:rounded-xl hover:text-foreground hover:decoration-foreground"
          >
            {inc.name}: {money(inc.from, inc.currency)} → {money(inc.to, inc.currency)} · {fullDate(inc.date)}
          </Link>
        ) : inc ? (
          <span className="text-muted-foreground">
            {inc.name}: {money(inc.from, inc.currency)} → {money(inc.to, inc.currency)} · {fullDate(inc.date)}
          </span>
        ) : (
          "in the last 12 months"
        )
      }
    />
  );
}

/** "YouTube Premium is overdue" / "A and B are overdue" / "A and 2 more are overdue". */
function overdueLine(names: string[]): string {
  if (names.length === 1) return `${names[0]} is overdue`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are overdue`;
  return `${names[0]} and ${names.length - 1} more are overdue`;
}

function Tile({
  label,
  value,
  sub,
  valueClass,
  icon,
  className,
}: {
  label: string;
  value: string;
  sub: ReactNode;
  valueClass?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent>
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={cn("mt-2 flex items-center gap-1.5 text-[26px] leading-tight font-semibold tracking-tight", valueClass)}>
          {icon}
          {value}
        </div>
        {/* Context-only sublines stay Ash; anything to act on sets Graphite itself. */}
        <div className="mt-1.5 text-[12.5px] leading-snug text-[var(--text-muted)]">{sub}</div>
      </CardContent>
    </Card>
  );
}
