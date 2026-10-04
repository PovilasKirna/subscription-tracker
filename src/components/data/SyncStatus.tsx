"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CircleAlertIcon, CircleCheckIcon, FileUpIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { sessionHealth, timeAgo } from "@/lib/bank";
import { fullDate } from "@/lib/format";
import { statusQuery } from "@/lib/query/options";
import { cn } from "@/lib/utils";

/** Compact "where does this data come from / is it fresh" pill for the Overview header. */
export function SyncStatus() {
  const { data } = useSuspenseQuery(statusQuery());
  const today = new Date().toISOString().slice(0, 10);
  const session = data.sessions[0];
  const health = session ? sessionHealth(session, today) : null;

  let icon = <FileUpIcon className="size-3.5" />;
  let label = data.lastDate ? `Data up to ${fullDate(data.lastDate)}` : "No data yet";
  if (data.syncing) {
    icon = <Loader2Icon className="size-3.5 animate-spin" />;
    label = "Syncing with Revolut…";
  } else if (session && health) {
    icon =
      health.level === "ok" ? (
        <CircleCheckIcon className="size-3.5" style={{ color: "var(--status-good)" }} />
      ) : (
        <CircleAlertIcon
          className="size-3.5"
          style={{ color: health.level === "error" ? "var(--status-critical)" : "var(--status-warning)" }}
        />
      );
    label =
      health.level === "error"
        ? `${session.aspsp}: reconnect needed`
        : `${session.aspsp} · synced ${session.lastSyncAt ? timeAgo(session.lastSyncAt) : "never"}`;
  }
  return (
    <Link
      href="/settings/data"
      title={health?.message ?? undefined}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 font-normal text-muted-foreground")}
    >
      {icon}
      {/* "x min ago" can tick over between server render and hydration. */}
      <span suppressHydrationWarning>{label}</span>
    </Link>
  );
}

export function SyncStatusSkeleton() {
  return <Skeleton className="h-7 w-44 rounded-lg" />;
}
