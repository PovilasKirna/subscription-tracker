"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BellIcon,
  CalendarClockIcon,
  CheckCheckIcon,
  CheckIcon,
  ClockAlertIcon,
  HandCoinsIcon,
  LandmarkIcon,
  type LucideIcon,
  RefreshCwOffIcon,
  SettingsIcon,
  SparklesIcon,
  TrendingUpIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/bank";
import { money, shortDate } from "@/lib/format";
import { useMarkRead, useReimbursement } from "@/lib/query/mutations";
import { notificationsQuery } from "@/lib/query/options";
import { reimbursementToast } from "@/lib/reimbursement";
import type { NotificationItem, NotificationType, ReminderCharge } from "@/lib/types";
import { cn } from "@/lib/utils";

// The in-app feed: a bell with the unread count (neither read nor resolved) and a panel, newest
// first. Opening it marks nothing; clicking an entry marks it read and opens what it's about.
// Reimbursement reminders can be settled right here, charge by charge.

const ICONS: Record<NotificationType, LucideIcon> = {
  reimbursement_reminder: HandCoinsIcon,
  bank_attention: LandmarkIcon,
  price_increase: TrendingUpIcon,
  yearly_renewal: CalendarClockIcon,
  new_subscription: SparklesIcon,
  subscription_overdue: ClockAlertIcon,
  sync_error: RefreshCwOffIcon,
};

export function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const feed = useQuery(notificationsQuery());
  const markRead = useMarkRead();
  const router = useRouter();
  const unread = feed.data?.unread ?? 0;

  const openItem = (n: NotificationItem) => {
    if (!n.read) markRead.mutate([n.id]);
    if (n.url) {
      setOpen(false);
      router.push(n.url);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={cn("relative text-muted-foreground hover:text-foreground", className)}
            aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          />
        }
      >
        <BellIcon />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--status-critical)] px-1 text-[10px] leading-none font-semibold text-white tabular-nums ring-2 ring-card"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] gap-0 p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <h2 className="font-medium">Notifications</h2>
          <Button variant="ghost" size="xs" disabled={!unread || markRead.isPending} onClick={() => markRead.mutate("all")}>
            <CheckCheckIcon /> Mark all read
          </Button>
        </div>
        <div className="max-h-[min(32rem,calc(100dvh-8rem))] overflow-y-auto overscroll-contain">
          {feed.isPending ? (
            <div className="flex flex-col gap-3 p-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : feed.error ? (
            <p className="p-4 text-sm text-destructive">{feed.error.message}</p>
          ) : feed.data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
              <BellIcon className="size-6 text-muted-foreground/60" aria-hidden />
              <p className="font-medium">You're all caught up</p>
              <p className="text-xs text-muted-foreground">
                Reimbursement reminders, price increases, renewals and bank issues will show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {feed.data.items.map((n) => (
                <FeedItem key={n.id} n={n} onOpen={() => openItem(n)} />
              ))}
            </ul>
          )}
        </div>
        <div className="border-t px-3 py-2">
          <Link
            href="/settings/notifications"
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <SettingsIcon className="size-3.5" /> Notification settings
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FeedItem({ n, onOpen }: { n: NotificationItem; onOpen: () => void }) {
  const Icon = ICONS[n.type] ?? BellIcon;
  const fresh = !n.read && !n.resolved;
  return (
    <li className={cn("relative", n.resolved && "opacity-60")}>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full gap-3 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60"
      >
        <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-muted", fresh && "text-foreground")}>
          <Icon className="size-3.5" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-start gap-2">
            <span className={cn("min-w-0 flex-1 text-sm", fresh ? "font-semibold" : "font-medium")}>{n.title}</span>
            {fresh && (
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--series-1)]">
                <span className="sr-only">Unread</span>
              </span>
            )}
          </span>
          <span className="line-clamp-3 text-xs text-muted-foreground">{n.body}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {timeAgo(n.createdAt)}
            {n.resolved && (
              <>
                <span aria-hidden>·</span>
                <CheckIcon className="size-3" aria-hidden /> Done
              </>
            )}
          </span>
        </span>
      </button>
      {n.charges && n.charges.length > 0 && <ReminderCharges charges={n.charges} />}
    </li>
  );
}

/** A reminder's charges: "Got €X" / "Not reimbursed" for the pending ones, the outcome for the rest. */
function ReminderCharges({ charges }: { charges: ReminderCharge[] }) {
  const record = useReimbursement();
  const [busy, setBusy] = useState<string | null>(null);
  const mark = (c: ReminderCharge, amount: number) => {
    setBusy(c.txId);
    record.mutate(
      { txId: c.txId, amount },
      { onSuccess: () => toast.success(reimbursementToast(amount, c.currency)), onSettled: () => setBusy(null) },
    );
  };
  return (
    <ul className="mx-3 mb-2.5 ml-13 flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-2 text-xs">
      {charges.map((c) => (
        <li key={c.txId} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{c.name}</span>{" "}
            <span className="text-muted-foreground tabular-nums">
              · {shortDate(c.date)} · {money(c.amount, c.currency)}
            </span>
          </span>
          {c.status === "pending" ? (
            <span className="flex gap-1">
              <Button size="xs" disabled={busy !== null} onClick={() => mark(c, c.expected)}>
                Got {money(c.expected, c.currency)}
              </Button>
              <Button size="xs" variant="outline" disabled={busy !== null} onClick={() => mark(c, 0)}>
                Not reimbursed
              </Button>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-muted-foreground">
              {c.status === "recorded" && c.recorded ? (
                <>
                  <CheckIcon className="size-3 text-[var(--status-good)]" aria-hidden /> {money(c.recorded, c.currency)} back
                </>
              ) : c.status === "recorded" ? (
                "Not reimbursed"
              ) : (
                "No longer pending"
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
