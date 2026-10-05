"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useQuery } from "@tanstack/react-query";
import {
  BanknoteIcon,
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
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
// The panel is a modal dialog laid out by CSS alone (no matchMedia, so the server and the first
// client render agree): the whole screen on phones, a sheet from the right from `md`.

const ICONS: Record<NotificationType, LucideIcon> = {
  reimbursement_reminder: HandCoinsIcon,
  bank_attention: LandmarkIcon,
  price_increase: TrendingUpIcon,
  yearly_renewal: CalendarClockIcon,
  upcoming_charge: BanknoteIcon,
  new_subscription: SparklesIcon,
  subscription_overdue: ClockAlertIcon,
  sync_error: RefreshCwOffIcon,
};

export function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const feed = useQuery(notificationsQuery());
  const markRead = useMarkRead();
  const router = useRouter();
  const closeRef = useRef<HTMLButtonElement>(null);
  const unread = feed.data?.unread ?? 0;

  const openItem = (n: NotificationItem) => {
    if (!n.read) markRead.mutate([n.id]);
    if (n.url) {
      setOpen(false);
      router.push(n.url);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={cn("relative text-muted-foreground hover:text-foreground pointer-coarse:size-11", className)}
            aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          />
        }
      >
        <BellIcon />
        {unread > 0 && (
          <span
            aria-hidden
            // White on status-critical is 4.8:1 in both themes; no theme token stays light in dark mode.
            className="absolute -top-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-status-critical px-1 text-xs leading-none font-semibold text-white tabular-nums ring-2 ring-card pointer-coarse:top-1 pointer-coarse:right-1"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DialogTrigger>
      <DialogPortal>
        {/* Hidden under the panel on phones; from md it dims the page beside the sheet and closes it on a click. */}
        <DialogOverlay className="motion-reduce:animate-none" />
        <DialogPrimitive.Popup
          initialFocus={closeRef}
          className={cn(
            // Phones: the whole screen, padded for the notch and the home indicator.
            "fixed inset-0 z-50 flex flex-col bg-popover text-sm text-popover-foreground outline-none",
            "pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]",
            // md+: a full-height sheet on the right, floating above the page.
            "md:left-auto md:w-[26rem] md:max-w-[calc(100vw-3rem)] md:border-l md:pl-0 md:shadow-[0_8px_28px_rgb(0_0_0/0.14)]",
            // Rises in on phones, slides in from the right from md; with reduced motion it only fades.
            "[--panel-from:translate3d(0,1.5rem,0)] md:[--panel-from:translate3d(100%,0,0)] motion-reduce:[--panel-from:none]",
            "transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity motion-reduce:duration-150",
            "data-starting-style:transform-(--panel-from) data-starting-style:opacity-0 data-ending-style:transform-(--panel-from) data-ending-style:opacity-0 data-ending-style:duration-200",
          )}
        >
          <div className="flex min-h-14 shrink-0 items-center gap-2 border-b py-1.5 pr-1.5 pl-4 md:min-h-12">
            <DialogTitle className="min-w-0 flex-1 text-base">Notifications</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              className="pointer-coarse:h-11"
              disabled={!unread || markRead.isPending}
              onClick={() => markRead.mutate("all")}
            >
              <CheckCheckIcon /> Mark all read
            </Button>
            <DialogClose
              ref={closeRef}
              render={<Button variant="ghost" size="icon" className="size-11 md:pointer-fine:size-8" aria-label="Close" />}
            >
              <XIcon />
            </DialogClose>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {feed.isPending ? (
              <div className="flex flex-col gap-3 p-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : feed.error ? (
              <p className="p-4 text-sm text-destructive-text">{feed.error.message}</p>
            ) : feed.data.items.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
                <BellIcon className="size-6 text-muted-foreground/60" aria-hidden />
                <p className="font-medium">You're all caught up</p>
                <p className="text-xs text-muted-foreground">
                  Upcoming charges, reimbursement reminders, price increases, renewals and bank issues will show up here.
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
          <div className="shrink-0 border-t px-4 py-2">
            <Link
              href="/settings/notifications"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring pointer-coarse:min-h-11"
            >
              <SettingsIcon className="size-3.5" /> Notification settings
            </Link>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
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
        className="flex w-full gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
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
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
    <ul className="mr-4 mb-3 ml-14 flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-2 text-xs">
      {charges.map((c) => (
        <li key={c.txId} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-36 flex-1">
            <span className="font-medium">{c.name}</span>{" "}
            <span className="text-muted-foreground tabular-nums">
              · {shortDate(c.date)} · {money(c.amount, c.currency)}
            </span>
          </span>
          {c.status === "pending" ? (
            <span className="flex gap-1">
              <Button
                size="xs"
                className="pointer-coarse:h-11 pointer-coarse:px-3"
                disabled={busy !== null}
                onClick={() => mark(c, c.expected)}
              >
                Got {money(c.expected, c.currency)}
              </Button>
              <Button
                size="xs"
                variant="outline"
                className="pointer-coarse:h-11 pointer-coarse:px-3"
                disabled={busy !== null}
                onClick={() => mark(c, 0)}
              >
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
