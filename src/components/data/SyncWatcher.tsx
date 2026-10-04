"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useResetAll } from "@/lib/query/mutations";
import { statusQuery } from "@/lib/query/options";

/** Shared toast id so a manual "Sync now" and a background sync never stack two toasts. */
export const SYNC_TOAST_ID = "bank-sync";

/**
 * Mounted once in the app shell: while a background bank sync runs (e.g. the first full-history
 * import after connecting), poll its status from any page, then announce it and reload every view.
 */
export function SyncWatcher() {
  const resetAll = useResetAll();
  const { data } = useQuery({ ...statusQuery(), refetchInterval: (q) => (q.state.data?.syncing ? 1500 : false) });

  const wasSyncing = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (!data) return;
    if (wasSyncing.current && !data.syncing) {
      const last = data.imports.find((i) => i.source === "bank");
      if (last?.message) toast.warning("Bank sync finished with problems", { id: SYNC_TOAST_ID, description: last.message });
      else
        toast.success("Bank sync finished", {
          id: SYNC_TOAST_ID,
          description: last ? `${last.inserted.toLocaleString("en-GB")} new transactions imported` : undefined,
        });
      void resetAll();
    }
    wasSyncing.current = data.syncing;
  }, [data, resetAll]);

  return null;
}
