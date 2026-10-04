"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ColorChoice } from "../color";
import type { OverrideStatus } from "../server/db";
import type { Cadence } from "../types";
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
