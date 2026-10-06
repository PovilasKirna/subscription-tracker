"use client";

import { ChevronRightIcon } from "lucide-react";
import { compactDate } from "@/components/data-table";
import { MerchantIcon } from "@/components/MerchantIcon";
import { money, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ColorSwatch } from "./ColorPicker";
import { StatusBadge } from "./StatusBadge";
import { SubscriptionFlags } from "./SubscriptionFlags";
import type { SubscriptionRow } from "./shared";

/** "next in 3 days" ahead of a charge, "due today" / "due 2 days ago" otherwise. */
function whenLabel(s: SubscriptionRow, today: string): string {
  if (!s.nextCharge) return `Last ${compactDate(s.lastCharge, today)}`;
  const rel = relativeDays(s.nextCharge, today);
  return rel.startsWith("in ") ? `next ${rel}` : `due ${rel}`;
}

/**
 * Phone row: logo, name and price on top; status, next charge and flags below. Spans only, since
 * it renders inside the row's button.
 */
export function SubscriptionMobileRow({
  sub: s,
  today,
  depth = 0,
  expanded = false,
}: {
  sub: SubscriptionRow;
  today: string;
  /** 1 for a group's member: indented under the group's row. */
  depth?: number;
  /** For a group's row: whether its members are showing. */
  expanded?: boolean;
}) {
  // Weekly, quarterly and yearly prices, and reimbursed ones, also show what they come to per month.
  const perMonth = Math.abs(s.netMonthlyCost - s.amount) >= 0.005;
  return (
    <span className={cn("flex items-center gap-3", depth > 0 && "pl-5")}>
      <span className="flex shrink-0 items-center gap-2">
        {s.members ? (
          <ChevronRightIcon
            className={cn(
              "-mx-[3px] size-4 text-muted-foreground transition-transform motion-reduce:transition-none",
              expanded && "rotate-90",
            )}
            aria-hidden
          />
        ) : (
          <ColorSwatch color={s.color} none={s.colorChosen && s.color === null} className="size-2.5" />
        )}
        <MerchantIcon name={s.name} website={s.website} />
      </span>
      <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1">
        <span className="truncate font-medium">{s.name}</span>
        <span className="tabular text-right font-medium whitespace-nowrap">{money(s.amount, s.currency)}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          <StatusBadge status={s.rowStatus} />
          <span aria-hidden>·</span>
          <span className="whitespace-nowrap">{whenLabel(s, today)}</span>
          {s.members ? (
            <>
              <span aria-hidden>·</span>
              <span className="whitespace-nowrap">
                {s.members.length} subscription{s.members.length === 1 ? "" : "s"}
              </span>
            </>
          ) : (
            <SubscriptionFlags sub={s} />
          )}
        </span>
        {perMonth ? (
          <span className="tabular text-right text-xs whitespace-nowrap text-muted-foreground">
            {money(s.netMonthlyCost, s.currency)}
            <span aria-hidden>/mo</span>
            <span className="sr-only"> per month</span>
          </span>
        ) : (
          <span />
        )}
      </span>
    </span>
  );
}
