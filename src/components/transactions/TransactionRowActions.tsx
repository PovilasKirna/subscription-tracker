"use client";

import { CopyIcon, EyeOffIcon, MoreHorizontalIcon, RepeatIcon, SearchIcon, SquareArrowOutUpRightIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOverride } from "@/lib/query/mutations";
import type { TransactionItem } from "@/lib/types";

/** Per-row "⋯" menu. Subscription actions live here rather than as a top-level button. */
export function TransactionRowActions({ tx, onShowMerchant }: { tx: TransactionItem; onShowMerchant: (merchantKey: string) => void }) {
  const override = useOverride();
  const outgoing = tx.amount < 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" className="data-popup-open:bg-muted" aria-label={`Actions for ${tx.description}`} />}
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {tx.subscriptionKey ? (
          <>
            <DropdownMenuItem render={<Link href={`/subscriptions?sub=${encodeURIComponent(tx.subscriptionKey)}`} />}>
              <SquareArrowOutUpRightIcon /> View subscription
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                override.mutate(
                  { key: tx.subscriptionKey as string, status: "ignored" },
                  { onSuccess: () => toast.success(`"${tx.description}" is no longer tracked as a subscription`) },
                )
              }
            >
              <EyeOffIcon /> Not a subscription
            </DropdownMenuItem>
          </>
        ) : (
          outgoing && (
            <DropdownMenuItem
              onClick={() =>
                override.mutate(
                  { key: `${tx.merchantKey}|${tx.currency}`, status: "confirmed" },
                  { onSuccess: () => toast.success(`Tracking "${tx.description}" as a subscription`) },
                )
              }
            >
              <RepeatIcon /> Track as subscription
            </DropdownMenuItem>
          )
        )}
        {(tx.subscriptionKey || outgoing) && <DropdownMenuSeparator />}
        <DropdownMenuItem onClick={() => onShowMerchant(tx.merchantKey)}>
          <SearchIcon /> All from this merchant
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void navigator.clipboard.writeText(tx.description);
            toast.success("Description copied");
          }}
        >
          <CopyIcon /> Copy description
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
