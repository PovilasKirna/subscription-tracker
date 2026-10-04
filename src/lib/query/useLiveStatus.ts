"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useInvalidateAll } from "./mutations";
import { statusQuery } from "./options";

/**
 * Data status that keeps itself current: while a background bank sync runs, poll until it
 * finishes, then refresh every view that depends on transactions. Use it wherever the sync
 * state is shown, so the page you happen to be on updates without a reload.
 */
export function useLiveStatus() {
  const query = useSuspenseQuery({ ...statusQuery(), refetchInterval: (q) => (q.state.data?.syncing ? 1500 : false) });
  const invalidate = useInvalidateAll();
  const syncing = query.data.syncing;

  const wasSyncing = useRef(syncing);
  useEffect(() => {
    if (wasSyncing.current && !syncing) {
      toast.success("Sync finished");
      void invalidate();
    }
    wasSyncing.current = syncing;
  }, [syncing, invalidate]);

  return query;
}
