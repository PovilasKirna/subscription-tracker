"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { OverrideStatus } from "../server/db";
import { api } from "./options";

export type OverrideInput = {
  key: string;
  displayName?: string | null;
  category?: string | null;
  status?: OverrideStatus | null;
};

/** Every server-side derived view depends on transactions + overrides, so refresh them all. */
export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
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
