"use client";

import { ChevronDownIcon, RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CATEGORIES, CATEGORY_IDS, type CategoryId, type CategoryKind } from "@/lib/categories";
import { useSetCategory } from "@/lib/query/mutations";
import type { TransactionItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CATEGORY_ICON } from "./CategoryIcon";

const GROUPS: { kind: CategoryKind; label: string }[] = [
  { kind: "spend", label: "Spending" },
  { kind: "income", label: "Income" },
  { kind: "internal", label: "Not spending or income" },
];

/**
 * The category choices for one payment, as menu items: "All payments from <merchant>" (on by
 * default, since every Lidl receipt is groceries), the categories by kind, and "Back to automatic"
 * once one was picked. Used by the table's category cell and the row's ⋯ menu (phones).
 */
export function CategoryMenuItems({ tx }: { tx: TransactionItem }) {
  const set = useSetCategory();
  const [allFromMerchant, setAllFromMerchant] = useState(tx.categoryChosen !== "payment");
  const merchant = tx.merchantKey.replace(/-/g, " ");
  const pick = (category: CategoryId | null, scope: "payment" | "merchant") => set.mutate({ txId: tx.id, scope, category });
  return (
    <>
      <DropdownMenuCheckboxItem checked={allFromMerchant} onCheckedChange={setAllFromMerchant} closeOnClick={false}>
        <span className="truncate">
          All payments from <span className="font-medium capitalize">{merchant}</span>
        </span>
      </DropdownMenuCheckboxItem>
      <DropdownMenuSeparator />
      <DropdownMenuRadioGroup
        value={tx.category}
        onValueChange={(v: string) => pick(v as CategoryId, allFromMerchant ? "merchant" : "payment")}
      >
        {GROUPS.map((g) => (
          <DropdownMenuGroup key={g.kind}>
            <DropdownMenuLabel>{g.label}</DropdownMenuLabel>
            {CATEGORY_IDS.filter((id) => CATEGORIES[id].kind === g.kind).map((id) => {
              const ItemIcon = CATEGORY_ICON[id];
              return (
                <DropdownMenuRadioItem key={id} value={id} title={CATEGORIES[id].hint}>
                  <ItemIcon /> {CATEGORIES[id].label}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuRadioGroup>
      {tx.categoryChosen && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => pick(null, tx.categoryChosen === "merchant" ? "merchant" : "payment")}>
            <RotateCcwIcon />
            {tx.categoryChosen === "merchant" ? "Back to automatic for this merchant" : "Back to automatic"}
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}

/** The category of a payment as a small button (the table's category column). */
export function CategoryPicker({ tx }: { tx: TransactionItem }) {
  const Icon = CATEGORY_ICON[tx.category];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={cn("-ml-2 h-7 max-w-full gap-1.5 px-2 font-normal text-muted-foreground")}
            aria-label={`Category: ${CATEGORIES[tx.category].label}. Change`}
          />
        }
      >
        <Icon className="size-3.5" />
        <span className="truncate">{CATEGORIES[tx.category].label}</span>
        <ChevronDownIcon className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70vh] w-64">
        <CategoryMenuItems tx={tx} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
