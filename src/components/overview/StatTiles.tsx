"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CircleAlertIcon, TrendingUpIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { fullDate, money } from "@/lib/format";
import { computeStats } from "@/lib/insights";
import { subscriptionsQuery } from "@/lib/query/options";

// Stat tiles: plain HTML, no chart library. Proportional figures for the big numbers.
export function StatTiles() {
  const { data } = useSuspenseQuery(subscriptionsQuery());
  const s = computeStats(data);
  const cur = data.baseCurrency;
  const inc = s.biggestIncrease;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
      <Card className="col-span-2 lg:col-span-1">
        <CardContent>
          <div className="text-sm text-muted-foreground">Monthly total</div>
          <div className="mt-2 text-5xl font-semibold tracking-tight">
            {money(s.monthly, cur)}
            <span className="ml-1 text-base font-medium tracking-normal text-muted-foreground">/mo</span>
          </div>
          <div className="mt-2 text-[13px] text-[var(--text-muted)]">
            {s.reimbursedMonthly > 0 && `after ${money(s.reimbursedMonthly, cur)} reimbursed · `}
            {money(s.dueNext30, cur)} due in the next 30 days
          </div>
          {s.pendingReimbursements > 0 && (
            <div className="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
              <CircleAlertIcon className="size-3.5 shrink-0 text-[var(--status-warning)]" aria-hidden />
              {s.pendingReimbursements} pending reimbursement{s.pendingReimbursements > 1 ? "s" : ""}
            </div>
          )}
        </CardContent>
      </Card>
      <Tile
        label="Yearly projection"
        value={money(s.yearly, cur, { cents: false })}
        sub={s.reimbursedMonthly > 0 ? "at today's prices, after reimbursements" : "at today's prices"}
      />
      <Tile
        label="Active subscriptions"
        value={String(s.activeCount + s.lateCount)}
        sub={s.lateCount ? `${s.lateCount} overdue — maybe cancelled?` : "all charging on schedule"}
      />
      <Tile
        label="Biggest price increase"
        value={inc ? `+${Math.round(inc.pct * 100)}%` : "None"}
        valueClass={inc ? "text-[var(--delta-bad)]" : undefined}
        icon={inc ? <TrendingUpIcon className="size-5 text-[var(--delta-bad)]" aria-hidden /> : null}
        sub={
          inc
            ? `${inc.name}: ${money(inc.from, inc.currency)} → ${money(inc.to, inc.currency)} · ${fullDate(inc.date)}`
            : "in the last 12 months"
        }
      />
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  valueClass,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent>
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={`mt-2 flex items-center gap-1.5 text-[26px] font-semibold tracking-tight ${valueClass ?? ""}`}>
          {icon}
          {value}
        </div>
        <div className="mt-1.5 text-[12.5px] leading-snug text-[var(--text-muted)]">{sub}</div>
      </CardContent>
    </Card>
  );
}
