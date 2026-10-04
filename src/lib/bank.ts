import { daysUntil } from "./format";
import type { BankSession } from "./types";

// Display rules for bank connections, shared by Settings → Data & sync and the Overview pill.

const EXPIRY_WARNING_DAYS = 14;
/** Without a fresh consent, banks only guarantee about this much history (PSD2). */
export const BANK_HISTORY_DAYS = 90;

export function sessionHealth(s: BankSession, today: string): { level: "ok" | "warn" | "error"; message: string | null } {
  if (s.status === "needs_reconnect") return { level: "error", message: s.lastError ?? "Reconnect to keep syncing." };
  const left = s.validUntil ? daysUntil(s.validUntil.slice(0, 10), today) : null;
  if (left !== null && left <= EXPIRY_WARNING_DAYS) {
    return { level: "warn", message: `Access expires in ${Math.max(0, left)} day${left === 1 ? "" : "s"} — reconnect to keep syncing.` };
  }
  if (s.lastError) return { level: "warn", message: s.lastError };
  return { level: "ok", message: null };
}

export type ConnectionTone = "syncing" | "good" | "warning" | "critical";

/** Short status for a connection tile: Syncing / Healthy / Access expires in N days / Needs reconnect. */
export function connectionStatus(s: BankSession, today: string): { tone: ConnectionTone; label: string; message: string | null } {
  const health = sessionHealth(s, today);
  if (s.syncing) return { tone: "syncing", label: "Syncing", message: health.message };
  if (health.level === "error") return { tone: "critical", label: "Needs reconnect", message: health.message };
  if (health.level === "warn") {
    const left = s.validUntil ? daysUntil(s.validUntil.slice(0, 10), today) : null;
    const label =
      left !== null && left <= EXPIRY_WARNING_DAYS
        ? `Access expires in ${Math.max(0, left)} day${left === 1 ? "" : "s"}`
        : "Last sync failed";
    return { tone: "warning", label, message: health.message };
  }
  return { tone: "good", label: "Healthy", message: null };
}

/** "just now", "5 min ago", "2h ago", "3 days ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.round((now - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
}

/**
 * Whether switching an account back on may leave a gap: it was last fetched so long ago that the
 * bank probably won't serve the missing transactions any more.
 */
export function historyGap(syncedThrough: string | null, now = Date.now()): boolean {
  return syncedThrough !== null && now - Date.parse(syncedThrough) > BANK_HISTORY_DAYS * 86_400_000;
}
