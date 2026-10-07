"use client";

import { type QueryClient, type QueryKey, useMutation, useMutationState, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ColorChoice } from "../color";
import type { OverrideStatus } from "../server/db";
import type { SettingsPatch } from "../settings";
import type {
  AssignOptionsPayload,
  Cadence,
  NotificationsPayload,
  ReimbursementMode,
  Settings,
  SubscriptionDetailPayload,
  SubscriptionsPayload,
  SubscriptionsTablePayload,
  TransactionItem,
  TransactionsPayload,
} from "../types";
import {
  type CategoryEdit,
  categorizeAssignOptions,
  categorizeDetail,
  categorizeTransactions,
  overrideDetail,
  overrideShownAtOnce,
  overrideSubscriptions,
  overrideTable,
} from "./optimistic";
import { api, keys } from "./options";

export type OverrideInput = {
  key: string;
  displayName?: string | null;
  category?: string | null;
  status?: OverrideStatus | null;
  /** Preset slot (1–8), custom hex, or "none"; null = automatic. */
  color?: ColorChoice | null;
  /** Renewal cadence; null = detected from the charges. */
  cadence?: Cadence | null;
  /** Website for the logo, e.g. "hostinger.com"; "" or null = back to the built-in one. */
  website?: string | null;
  /** Group on the Subscriptions page; "" or null = ungrouped. */
  group?: string | null;
};

/** After a bank sync, import or deletion: everything may have changed, the data status included. */
export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

/**
 * Queries computed from the transactions and the user's edits (the server's detection snapshot).
 * An edit refreshes only these: the data status, settings, devices and investments don't change.
 */
const DERIVED: ReadonlySet<unknown> = new Set([
  keys.subscriptions[0],
  "subscriptions-table",
  "history",
  "transactions",
  "subscription-detail",
  "assign-options",
  keys.reimbursementSources[0],
  keys.notifications[0], // resolves "new subscription" and reimbursement reminders
  "spending",
  keys.netWorth[0], // an account's page lists its payments
]);
/** Where a payment's category shows. Subscriptions and their history don't use it. */
const CATEGORIZED: ReadonlySet<unknown> = new Set(["transactions", "subscription-detail", "assign-options", "spending", keys.netWorth[0]]);

const refresh = (qc: QueryClient, kinds: ReadonlySet<unknown>) => qc.invalidateQueries({ predicate: (q) => kinds.has(q.queryKey[0]) });

/** Refreshes the derived views after an edit (see DERIVED). */
export function useInvalidateDerived() {
  const qc = useQueryClient();
  return () => refresh(qc, DERIVED);
}

/**
 * After new transactions land (bank sync): reset rather than invalidate, so suspense views drop
 * their stale data and show skeletons while they refetch. Status refreshes in place (it drives the
 * sync UI itself), and the bank list doesn't depend on transactions.
 */
export function useResetAll() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.resetQueries({ predicate: (q) => q.queryKey[0] !== keys.status[0] && q.queryKey[0] !== "aspsps" }),
      qc.invalidateQueries({ queryKey: keys.status }),
    ]);
}

type Snapshot = [QueryKey, unknown][];

/**
 * Applies an edit to every cached query under `queryKey` that has data, noting what it replaced
 * in `out` (for a rollback). Refetches already under way are cancelled first: they started before
 * the edit and would land on top of it. Queries still loading for the first time are left alone,
 * so a view waiting on one in Suspense isn't disturbed.
 */
async function patchCached<T>(qc: QueryClient, queryKey: QueryKey, patch: (data: T) => T, out: Snapshot) {
  await qc.cancelQueries({ queryKey, predicate: (q) => q.state.data !== undefined });
  for (const [key, data] of qc.getQueriesData<T>({ queryKey })) {
    if (data === undefined) continue;
    const next = patch(data);
    if (next === data) continue;
    out.push([key, data]);
    qc.setQueryData(key, next);
  }
}

const OVERRIDE = ["override"] as const;
const SET_CATEGORY = ["set-category"] as const;
/** What the edits that settled while others were in flight still need refreshed (the last one does it). */
const owedRefresh = new Set<unknown>();

/**
 * Shared by the per-item edits (subscription overrides, categories), which only ever block the
 * item being edited: the cache is patched before the request and the request runs on its own (the
 * menu that started it can close), with the item's controls showing it as saving. When the patch
 * shows the whole edit (`shownAtOnce`) the views refresh in the background afterwards; otherwise the
 * item stays "saving" until the refresh brings the result. Edits can overlap and finish in any
 * order, so the refresh and any rollback wait for the last one: a refetch while another is in
 * flight would briefly show that one undone. A failed edit rolls back with a toast.
 */
function optimisticEdit<V>(
  qc: QueryClient,
  opts: {
    patch: (vars: V, out: Snapshot) => Promise<void>;
    shownAtOnce: (vars: V) => boolean;
    refreshes: ReadonlySet<unknown>;
    error: string;
  },
) {
  // Still counts the settling mutation itself (callbacks run before it leaves "pending").
  const othersInFlight = () => qc.isMutating({ mutationKey: OVERRIDE }) + qc.isMutating({ mutationKey: SET_CATEGORY }) > 1;
  return {
    onMutate: async (vars: V) => {
      const previous: Snapshot = [];
      await opts.patch(vars, previous);
      return { previous };
    },
    onError: (e: Error, _vars: V, ctx: { previous: Snapshot } | undefined) => {
      if (ctx && !othersInFlight()) for (const [key, data] of ctx.previous) qc.setQueryData(key, data);
      toast.error(opts.error, { description: e.message });
    },
    onSettled: (_data: unknown, error: Error | null, vars: V) => {
      for (const kind of opts.refreshes) owedRefresh.add(kind);
      if (othersInFlight()) return;
      const refreshed = refresh(qc, new Set(owedRefresh));
      owedRefresh.clear();
      // Returned, the mutation (and the item's spinner) waits for it.
      return error || opts.shownAtOnce(vars) ? undefined : refreshed;
    },
  };
}

/**
 * Change how a subscription is shown or tracked. A new name, category, logo or group shows at once
 * (see optimistic.ts); anything else keeps the subscription "saving" until detection has rerun.
 */
export function useOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...OVERRIDE, "set"],
    mutationFn: ({ key, ...body }: OverrideInput) =>
      api(`/api/overrides/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify(body) }),
    ...optimisticEdit(qc, {
      patch: async (edit: OverrideInput, out) => {
        await Promise.all([
          patchCached<SubscriptionsPayload>(qc, keys.subscriptions, (d) => overrideSubscriptions(d, edit), out),
          patchCached<SubscriptionsTablePayload>(qc, ["subscriptions-table"], (d) => overrideTable(d, edit), out),
          patchCached<SubscriptionDetailPayload>(qc, keys.subscriptionDetail(edit.key), (d) => overrideDetail(d, edit), out),
        ]);
      },
      shownAtOnce: overrideShownAtOnce,
      refreshes: DERIVED,
      error: "Couldn't save the change",
    }),
  });
}

/** Drop a subscription's overrides (restores an ignored one). Nothing to show before detection reruns. */
export function useResetOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...OVERRIDE, "reset"],
    mutationFn: (key: string) => api(`/api/overrides/${encodeURIComponent(key)}`, { method: "DELETE" }),
    ...optimisticEdit<string>(qc, { patch: async () => {}, shownAtOnce: () => false, refreshes: DERIVED, error: "Couldn't restore it" }),
  });
}

/** Whether an edit of this subscription is still saving (its controls show a spinner meanwhile). */
export function useOverridePending(key: string): boolean {
  return useMutationState({
    filters: { mutationKey: OVERRIDE, status: "pending" },
    select: (m) => {
      const vars = m.state.variables as OverrideInput | string | undefined;
      return typeof vars === "string" ? vars : vars?.key;
    },
  }).includes(key);
}

/** Put payments into a subscription (`subKey` null starts a new one). Resolves to its key. */
export function useAssign() {
  const invalidate = useInvalidateDerived();
  return useMutation({
    mutationFn: (input: { subKey: string | null; txIds: string[] }) =>
      api<{ key: string }>("/api/assignments", { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
}

/** Split a subscription into one per price it's billed at. Resolves to the new keys. */
export function useSplit() {
  const invalidate = useInvalidateDerived();
  return useMutation({
    mutationFn: (key: string) => api<{ keys: string[] }>("/api/subscriptions/split", { method: "POST", body: JSON.stringify({ key }) }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
}

/** Remove one charge from its subscription (or put it back). Detection recalculates server-side. */
export function useExclusion() {
  const invalidate = useInvalidateDerived();
  return useMutation({
    mutationFn: ({ txId, exclude }: { txId: string; exclude: boolean }) =>
      api(`/api/exclusions/${encodeURIComponent(txId)}`, { method: exclude ? "PUT" : "DELETE" }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
}

/** Record what came back for one charge (0 = not reimbursed), or forget it with `amount` null. */
export function useReimbursement() {
  const invalidate = useInvalidateDerived();
  return useMutation({
    mutationFn: ({ txId, amount }: { txId: string; amount: number | null }) =>
      api(
        `/api/reimbursements/${encodeURIComponent(txId)}`,
        amount === null ? { method: "DELETE" } : { method: "PUT", body: JSON.stringify({ amount }) },
      ),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
}

export type SourceInput = { name: string; mode: ReimbursementMode; reminderDay: number | null };

export type PeriodInput = {
  subKey: string;
  /** YYYY-MM-DD the period applies from. */
  startsOn: string;
} & (
  | { stop: true }
  | {
      /** Expected back per charge, major units. */
      amount: number;
      /** An existing source, or a new one to create; neither = the default "Salary". */
      sourceId?: number;
      newSource?: SourceInput;
    }
);

/** Start a reimbursement period (set up, change or stop) from a chosen date. */
export function useReimbursementPeriod() {
  const invalidate = useInvalidateDerived();
  return useMutation({
    mutationFn: (input: PeriodInput) => api("/api/reimbursements/periods", { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
}

export function useDeleteReimbursementPeriod() {
  const invalidate = useInvalidateDerived();
  return useMutation({
    mutationFn: (id: number) => api(`/api/reimbursements/periods/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
}

/** Add a source (no `id`) or edit one. Resolves to its `{ id }`. */
export function useSaveSource() {
  const invalidate = useInvalidateDerived();
  return useMutation({
    mutationFn: ({ id, ...body }: SourceInput & { id?: number }) =>
      id === undefined
        ? api<{ id: number }>("/api/reimbursements/sources", { method: "POST", body: JSON.stringify(body) })
        : api(`/api/reimbursements/sources/${id}`, { method: "PUT", body: JSON.stringify(body) }).then(() => ({ id })),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
}

export function useDeleteSource() {
  const invalidate = useInvalidateDerived();
  return useMutation({
    mutationFn: (id: number) => api(`/api/reimbursements/sources/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
}

const SAVE_SETTINGS = ["saveSettings"] as const;

/**
 * Change preferences (any subset). Applied to the cache at once so switches feel instant. Saves can
 * overlap (two quick toggles) and finish in any order, so no single response is written to the
 * cache: a slow earlier one would undo a newer change. Instead the last save to settle refetches
 * the settings, so the cache ends up as the server has them.
 */
export function useSaveSettings() {
  const qc = useQueryClient();
  // Still counts the settling mutation itself (callbacks run before it leaves "pending").
  const othersInFlight = () => qc.isMutating({ mutationKey: SAVE_SETTINGS }) > 1;
  return useMutation({
    mutationKey: SAVE_SETTINGS,
    mutationFn: (patch: SettingsPatch) => api<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: keys.settings });
      const previous = qc.getQueryData<Settings>(keys.settings);
      if (previous) {
        const notifications = { ...previous.notifications };
        for (const [type, pref] of Object.entries(patch.notifications ?? {}) as [keyof Settings["notifications"], object][]) {
          notifications[type] = { ...notifications[type], ...pref };
        }
        qc.setQueryData<Settings>(keys.settings, { ...previous, ...patch, notifications });
      }
      return { previous };
    },
    onError: (e, _patch, ctx) => {
      // Roll back only when nothing newer is in flight; otherwise the refetch below sorts it out
      // without wiping the other save's optimistic change.
      if (ctx?.previous && !othersInFlight()) qc.setQueryData(keys.settings, ctx.previous);
      toast.error("Couldn't save the setting", { description: e.message });
    },
    onSettled: () => {
      // A refetch while another save is pending would briefly show its change as undone.
      if (!othersInFlight()) void qc.invalidateQueries({ queryKey: keys.settings });
    },
  });
}

/** Mark notifications read (`ids`), or all of them. Updates the bell immediately. */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[] | "all") =>
      api("/api/notifications/read", { method: "POST", body: JSON.stringify(ids === "all" ? { all: true } : { ids }) }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: keys.notifications });
      const previous = qc.getQueryData<NotificationsPayload>(keys.notifications);
      if (previous) {
        const marks = (id: number) => ids === "all" || ids.includes(id);
        const newlyRead = previous.items.filter((n) => marks(n.id) && !n.read && !n.resolved).length;
        qc.setQueryData<NotificationsPayload>(keys.notifications, {
          items: previous.items.map((n) => (marks(n.id) ? { ...n, read: true } : n)),
          unread: ids === "all" ? 0 : Math.max(0, previous.unread - newlyRead),
        });
      }
      return { previous };
    },
    onError: (e, _ids, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.notifications, ctx.previous);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}

/** "Refresh" on the Net worth page: syncs the bank (fetching balances) and Trading 212. */
export function useRefreshNetWorth() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: () => api<{ ok: boolean; errors: string[] }>("/api/net-worth/refresh", { method: "POST" }),
    onSuccess: (r) => {
      if (r.errors.length) toast.error(r.errors[0]);
      return invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
}

/** The payment, its merchant (scope "merchant" covers all of its payments) and the category; null = automatic. */
export type CategoryInput = CategoryEdit;

/**
 * Sets (or resets, with null) a payment's category, for it alone or for its whole merchant. Shows at
 * once in the tables and the subscription drawer; spending totals follow with the background refresh.
 */
export function useSetCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: SET_CATEGORY,
    mutationFn: ({ txId, scope, category }: CategoryInput) =>
      api("/api/categories", { method: "PUT", body: JSON.stringify({ txId, scope, category }) }),
    ...optimisticEdit(qc, {
      patch: async (edit: CategoryInput, out) => {
        await Promise.all([
          patchCached<TransactionsPayload>(qc, ["transactions"], (d) => categorizeTransactions(d, edit), out),
          patchCached<SubscriptionDetailPayload>(qc, ["subscription-detail"], (d) => categorizeDetail(d, edit), out),
          patchCached<AssignOptionsPayload>(qc, ["assign-options"], (d) => categorizeAssignOptions(d, edit), out),
        ]);
      },
      // Back to automatic: detection decides the category, so the payment stays "saving" until then.
      shownAtOnce: (edit) => edit.category !== null,
      refreshes: CATEGORIZED,
      error: "Couldn't change the category",
    }),
  });
}

/** Whether a category change covering this payment is still saving (who it covers: see categorizeItem). */
export function useCategoryPending(tx: Pick<TransactionItem, "id" | "merchantKey" | "categoryChosen">): boolean {
  return useMutationState({
    filters: { mutationKey: SET_CATEGORY, status: "pending" },
    select: (m) => m.state.variables as CategoryInput | undefined,
  }).some(
    (e) =>
      e !== undefined &&
      (e.txId === tx.id || (e.scope === "merchant" && e.merchantKey === tx.merchantKey && tx.categoryChosen !== "payment")),
  );
}
