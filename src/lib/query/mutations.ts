"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ColorChoice } from "../color";
import type { OverrideStatus } from "../server/db";
import type { SettingsPatch } from "../settings";
import type { Cadence, NotificationsPayload, ReimbursementMode, Settings } from "../types";
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
};

/** Every server-side derived view depends on transactions + overrides, so refresh them all. */
export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
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

export function useOverride() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ key, ...body }: OverrideInput) =>
      api(`/api/overrides/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
}

export function useResetOverride() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (key: string) => api(`/api/overrides/${encodeURIComponent(key)}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
}

/** Put payments into a subscription (`subKey` null starts a new one). Resolves to its key. */
export function useAssign() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { subKey: string | null; txIds: string[] }) =>
      api<{ key: string }>("/api/assignments", { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
}

/** Remove one charge from its subscription (or put it back). Detection recalculates server-side. */
export function useExclusion() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ txId, exclude }: { txId: string; exclude: boolean }) =>
      api(`/api/exclusions/${encodeURIComponent(txId)}`, { method: exclude ? "PUT" : "DELETE" }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
}

/** Record what came back for one charge (0 = not reimbursed), or forget it with `amount` null. */
export function useReimbursement() {
  const invalidate = useInvalidateAll();
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
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: PeriodInput) => api("/api/reimbursements/periods", { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
}

export function useDeleteReimbursementPeriod() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: number) => api(`/api/reimbursements/periods/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
}

/** Add a source (no `id`) or edit one. Resolves to its `{ id }`. */
export function useSaveSource() {
  const invalidate = useInvalidateAll();
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
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: number) => api(`/api/reimbursements/sources/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
}

/**
 * Change preferences (any subset). Applied to the cache at once so switches feel instant, rolled
 * back if the server refuses.
 */
export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
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
      if (ctx?.previous) qc.setQueryData(keys.settings, ctx.previous);
      toast.error("Couldn't save the setting", { description: e.message });
    },
    onSuccess: (settings) => qc.setQueryData(keys.settings, settings),
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
