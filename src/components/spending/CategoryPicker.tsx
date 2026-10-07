"use client";

import { ChevronDownIcon, Loader2Icon, RotateCcwIcon, Settings2Icon } from "lucide-react";
import Link from "next/link";
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
import { CATEGORY_KINDS, type CategoryId, KIND_LABEL } from "@/lib/categories";
import { useCategoryPending, useSetCategory } from "@/lib/query/mutations";
import { useCategories } from "@/lib/query/useCategories";
import type { TransactionItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CATEGORY_ICONS, CategoryIconOnly } from "./CategoryIcon";

/**
 * The category choices for one payment, as menu items: "All payments from <merchant>" (on by
 * default, since every Lidl receipt is groceries), the categories by kind (hidden ones left out),
 * and "Back to automatic" once one was picked. Used by the table's category cell and the row's ⋯
 * menu (phones).
 */
export function CategoryMenuItems({ tx }: { tx: TransactionItem }) {
  const categories = useCategories();
  const set = useSetCategory();
  const [allFromMerchant, setAllFromMerchant] = useState(tx.categoryChosen !== "payment");
  const merchant = tx.merchantKey.replace(/-/g, " ");
  const pick = (category: CategoryId | null, scope: "payment" | "merchant") =>
    set.mutate({ txId: tx.id, merchantKey: tx.merchantKey, scope, category });
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
        {CATEGORY_KINDS.map((kind) => {
          const items = categories.list.filter((c) => c.kind === kind && !c.hidden);
          return (
            items.length > 0 && (
              <DropdownMenuGroup key={kind}>
                <DropdownMenuLabel>{KIND_LABEL[kind]}</DropdownMenuLabel>
                {items.map((c) => {
                  const ItemIcon = CATEGORY_ICONS[c.icon];
                  return (
                    <DropdownMenuRadioItem key={c.id} value={c.id} title={c.hint}>
                      <ItemIcon /> {c.label}
                    </DropdownMenuRadioItem>
                  );
                })}
              </DropdownMenuGroup>
            )
          );
        })}
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
      <DropdownMenuSeparator />
      <DropdownMenuItem render={<Link href="/settings/categories" />}>
        <Settings2Icon /> Manage categories
      </DropdownMenuItem>
    </>
  );
}

/**
 * The category of a payment as a small button (the table's category column). The new category
 * shows at once; while it saves the button spins and waits, the rest of the table stays usable.
 */
export function CategoryPicker({ tx }: { tx: TransactionItem }) {
  const label = useCategories().of(tx.category).label;
  const saving = useCategoryPending(tx);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={saving}
        render={
          <Button
            variant="ghost"
            size="sm"
            className={cn("-ml-2 h-7 max-w-full gap-1.5 px-2 font-normal text-muted-foreground")}
            aria-label={`Category: ${label}. ${saving ? "Saving…" : "Change"}`}
            aria-busy={saving}
          />
        }
      >
        <CategoryIconOnly id={tx.category} className="size-3.5" />
        <span className="truncate">{label}</span>
        {saving ? <Loader2Icon className="size-3 animate-spin" aria-hidden /> : <ChevronDownIcon className="size-3 opacity-60" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70vh] w-64">
        <CategoryMenuItems tx={tx} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
