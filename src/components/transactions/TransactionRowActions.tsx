"use client";

import {
  ArrowRightLeftIcon,
  CopyIcon,
  EyeOffIcon,
  MinusCircleIcon,
  MoreHorizontalIcon,
  RepeatIcon,
  SearchIcon,
  SquareArrowOutUpRightIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useExclusion, useOverride } from "@/lib/query/mutations";
import type { TransactionItem } from "@/lib/types";
import { AddToSubscriptionDialog } from "./AddToSubscriptionDialog";

/** Per-row "⋯" menu. Subscription actions live here rather than as a top-level button. */
export function TransactionRowActions({ tx, onShowMerchant }: { tx: TransactionItem; onShowMerchant: (merchantKey: string) => void }) {
  const override = useOverride();
  const exclusion = useExclusion();
  const [assigning, setAssigning] = useState(false);
  const outgoing = tx.amount < 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" className="data-popup-open:bg-muted" aria-label={`Actions for ${tx.description}`} />
          }
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {tx.subscriptionKey ? (
            <>
              <DropdownMenuItem render={<Link href={`/subscriptions?sub=${encodeURIComponent(tx.subscriptionKey)}`} />}>
                <SquareArrowOutUpRightIcon /> View subscription
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAssigning(true)}>
                <ArrowRightLeftIcon /> Move to another subscription…
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  exclusion.mutate(
                    { txId: tx.id, exclude: true },
                    { onSuccess: () => toast.success("Charge removed from its subscription") },
                  )
                }
              >
                <MinusCircleIcon /> Remove this charge
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
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
              <DropdownMenuItem onClick={() => setAssigning(true)}>
                <RepeatIcon /> Add to subscription…
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
      {/* Mounted only while open so a page of rows doesn't each hold a dialog and its query. */}
      {assigning && <AddToSubscriptionDialog tx={tx} onOpenChange={setAssigning} />}
    </>
  );
}
