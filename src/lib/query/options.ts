import { queryOptions } from "@tanstack/react-query";
import {
  type SubscriptionFilters,
  serializeSubscriptionParams,
  serializeTransactionParams,
  type TransactionFilters,
} from "../search-params";
import type {
  AssignOptionsPayload,
  DataStatusPayload,
  HistoryPayload,
  MailStatusPayload,
  NotificationsPayload,
  PushDevicesPayload,
  ReimbursementSourcesPayload,
  SchedulerStatusPayload,
  Settings,
  SubscriptionDetailPayload,
  SubscriptionsPayload,
  SubscriptionsTablePayload,
  TransactionsPayload,
} from "../types";

// Query definitions shared by server prefetching (which swaps queryFn for a direct DB call)
// and client components (which fetch the matching /api route).

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((body as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

export const keys = {
  subscriptions: ["subscriptions"] as const,
  subscriptionsTable: (filters: SubscriptionFilters) => ["subscriptions-table", filters] as const,
  history: (months: number) => ["history", months] as const,
  transactions: (filters: TransactionFilters) => ["transactions", filters] as const,
  status: ["status"] as const,
  subscriptionDetail: (key: string) => ["subscription-detail", key] as const,
  assignOptions: (txId: string) => ["assign-options", txId] as const,
  pushDevices: ["push-devices"] as const,
  pushKey: ["push-key"] as const,
  mailStatus: ["mail-status"] as const,
  reimbursementSources: ["reimbursement-sources"] as const,
  notifications: ["notifications"] as const,
  settings: ["settings"] as const,
  scheduler: ["scheduler"] as const,
};

export const subscriptionsQuery = () =>
  queryOptions({ queryKey: keys.subscriptions, queryFn: () => api<SubscriptionsPayload>("/api/subscriptions") });

/** One page of the subscriptions data table; the full list above stays for the Overview. */
export const subscriptionsTableQuery = (filters: SubscriptionFilters) =>
  queryOptions({
    queryKey: keys.subscriptionsTable(filters),
    queryFn: () => api<SubscriptionsTablePayload>(`/api/subscriptions/table${serializeSubscriptionParams(filters)}`),
  });

export const historyQuery = (months: number) =>
  queryOptions({ queryKey: keys.history(months), queryFn: () => api<HistoryPayload>(`/api/history?months=${months}`) });

export const transactionsQuery = (filters: TransactionFilters) =>
  queryOptions({
    queryKey: keys.transactions(filters),
    // Serialised by the same nuqs parsers the API route parses with.
    queryFn: () => api<TransactionsPayload>(`/api/transactions${serializeTransactionParams(filters)}`),
  });

export const subscriptionDetailQuery = (key: string) =>
  queryOptions({
    queryKey: keys.subscriptionDetail(key),
    queryFn: () => api<SubscriptionDetailPayload>(`/api/subscriptions/detail?${new URLSearchParams({ key })}`),
  });

/** Targets and related payments for the "Add to subscription" dialog. */
export const assignOptionsQuery = (txId: string) =>
  queryOptions({
    queryKey: keys.assignOptions(txId),
    queryFn: () => api<AssignOptionsPayload>(`/api/assignments?${new URLSearchParams({ tx: txId })}`),
  });

export const statusQuery = () => queryOptions({ queryKey: keys.status, queryFn: () => api<DataStatusPayload>("/api/status") });

/** Devices that get push notifications, and whether push is set up on the server. */
export const pushDevicesQuery = () =>
  queryOptions({ queryKey: keys.pushDevices, queryFn: () => api<PushDevicesPayload>("/api/push/subscriptions") });

/** The VAPID public key browsers subscribe with (null until push is set up). Fixed per deployment. */
export const pushKeyQuery = () =>
  queryOptions({ queryKey: keys.pushKey, queryFn: () => api<{ publicKey: string | null }>("/api/push/key"), staleTime: Infinity });

export const mailStatusQuery = () => queryOptions({ queryKey: keys.mailStatus, queryFn: () => api<MailStatusPayload>("/api/mail") });
/** Reimbursement sources with the subscriptions using each. */
export const reimbursementSourcesQuery = () =>
  queryOptions({
    queryKey: keys.reimbursementSources,
    queryFn: () => api<ReimbursementSourcesPayload>("/api/reimbursements/sources"),
  });

/** The bell's feed. Polled every minute and on focus, so reminders show up without a reload. */
export const notificationsQuery = () =>
  queryOptions({
    queryKey: keys.notifications,
    queryFn: () => api<NotificationsPayload>("/api/notifications"),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

export const settingsQuery = () => queryOptions({ queryKey: keys.settings, queryFn: () => api<Settings>("/api/settings") });

/** Whether something is calling /api/cron/tick, for Settings → Notifications. */
export const schedulerQuery = () =>
  queryOptions({ queryKey: keys.scheduler, queryFn: () => api<SchedulerStatusPayload>("/api/notifications/scheduler") });
