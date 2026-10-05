"use client";

import { RepeatIcon } from "lucide-react";
import { compactDate } from "@/components/data-table";
import { MerchantIcon } from "@/components/MerchantIcon";
import type { TransactionItem } from "@/lib/types";
import { merchantName, TransactionAmount, typeLabel } from "./columns";

/** Phone row: logo, description and amount on top; "4 Oct · Card payment" and the subscription mark below. */
export function TransactionMobileRow({ tx, today }: { tx: TransactionItem; today: string }) {
  return (
    <span className="flex items-center gap-3">
      <MerchantIcon name={merchantName(tx)} website={tx.website} />
      <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5">
        <span className="truncate font-medium">{tx.description}</span>
        <TransactionAmount tx={tx} className="text-right" />
        <span className="col-span-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">
            <span className="tabular">{compactDate(tx.date, today)}</span>
            {typeLabel(tx) && <> · {typeLabel(tx)}</>}
          </span>
          {tx.subscriptionKey && (
            <>
              <RepeatIcon className="size-3.5 shrink-0" aria-hidden />
              <span className="sr-only">Subscription charge</span>
            </>
          )}
        </span>
      </span>
    </span>
  );
}
