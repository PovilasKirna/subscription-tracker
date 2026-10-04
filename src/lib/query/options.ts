import { queryOptions } from "@tanstack/react-query";
import {
  type SubscriptionFilters,
  serializeSubscriptionParams,
  serializeTransactionParams,
  type TransactionFilters,
} from "../search-params";
import type {
  DataStatusPayload,
  HistoryPayload,
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

export const statusQuery = () => queryOptions({ queryKey: keys.status, queryFn: () => api<DataStatusPayload>("/api/status") });
