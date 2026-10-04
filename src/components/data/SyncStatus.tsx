"use client";

import { CircleAlertIcon, CircleCheckIcon, FileUpIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fullDate } from "@/lib/format";
import { useLiveStatus } from "@/lib/query/useLiveStatus";
import { cn } from "@/lib/utils";
import { sessionHealth } from "./BankCard";

function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
}

/** Compact "where does this data come from / is it fresh" pill for the Overview header. */
export function SyncStatus() {
  const { data } = useLiveStatus();
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
        <CircleAlertIcon className="size-3.5" style={{ color: health.level === "error" ? "var(--status-critical)" : "var(--status-warning)" }} />
      );
    label =
      health.level === "error"
        ? `${session.aspsp}: reconnect needed`
        : `${session.aspsp} · synced ${session.lastSyncAt ? ago(session.lastSyncAt) : "never"}`;
  }
  return (
    <Link
      href="/data"
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
