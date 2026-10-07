"use client";

import { Loader2Icon, RepeatIcon } from "lucide-react";
import { compactDate } from "@/components/data-table";
import { MerchantIcon } from "@/components/MerchantIcon";
import { CATEGORIES } from "@/lib/categories";
import { useCategoryPending } from "@/lib/query/mutations";
import type { TransactionItem } from "@/lib/types";
import { merchantName, TransactionAmount } from "./columns";

/** Phone row: logo, description and amount on top; "4 Oct · Groceries" and the subscription mark below. Change the category from the row's ⋯ menu. */
export function TransactionMobileRow({ tx, today }: { tx: TransactionItem; today: string }) {
  const savingCategory = useCategoryPending(tx);
  return (
    <span className="flex items-center gap-3">
      <MerchantIcon name={merchantName(tx)} website={tx.website} />
      <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5">
        <span className="truncate font-medium">{tx.description}</span>
        <TransactionAmount tx={tx} className="text-right" />
        <span className="col-span-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">
            <span className="tabular">{compactDate(tx.date, today)}</span>
            {" · "}
            {CATEGORIES[tx.category].label}
          </span>
          {savingCategory && (
            <>
              <Loader2Icon className="size-3.5 shrink-0 animate-spin" aria-hidden />
              <span className="sr-only">Saving category</span>
            </>
          )}
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
