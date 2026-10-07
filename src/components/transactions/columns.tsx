"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { RepeatIcon } from "lucide-react";
import { DataTableColumnHeader } from "@/components/data-table";
import { MerchantIcon } from "@/components/MerchantIcon";
import { CategoryPicker } from "@/components/spending/CategoryPicker";
import { Badge } from "@/components/ui/badge";
import { fullDate, money } from "@/lib/format";
import type { TX_TYPES } from "@/lib/search-params";
import type { TransactionItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SOURCE_LABEL, TYPE_LABEL } from "./filters";
import { TransactionRowActions } from "./TransactionRowActions";

export const merchantName = (tx: TransactionItem) => tx.merchantKey.replace(/-/g, " ");

export const typeLabel = (tx: TransactionItem) => TYPE_LABEL[(tx.type ?? "UNKNOWN") as (typeof TX_TYPES)[number]] ?? tx.type;

/** Signed amount; money in is green with a "+" (never colour alone). */
export function TransactionAmount({ tx, className }: { tx: TransactionItem; className?: string }) {
  return (
    <span className={cn("tabular font-medium whitespace-nowrap", tx.amount > 0 && "text-[var(--delta-good)]", className)}>
      {tx.amount > 0 ? "+" : ""}
      {money(tx.amount, tx.currency)}
    </span>
  );
}

/** Column ids that can be sorted match the server's `sort` values. */
export function transactionColumns(onShowMerchant: (merchantKey: string) => void): ColumnDef<TransactionItem>[] {
  return [
    {
      id: "date",
      accessorKey: "date",
      meta: { label: "Date", className: "whitespace-nowrap" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => <span className="tabular text-muted-foreground">{fullDate(row.original.date)}</span>,
    },
    {
      id: "description",
      accessorKey: "description",
      enableHiding: false,
      // Takes the leftover width and truncates instead of pushing the table wider.
      meta: { label: "Description", className: "w-full max-w-0 min-w-40" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <MerchantIcon name={merchantName(row.original)} website={row.original.website} size="sm" />
          <span className="truncate font-medium">{row.original.description}</span>
          {row.original.subscriptionKey && (
            <Badge variant="secondary" className="shrink-0 gap-1">
              <RepeatIcon aria-hidden />
              {/* Icon-only until the card has room for the word. */}
              <span className="sr-only @3xl/data-table:not-sr-only">Subscription</span>
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "category",
      accessorKey: "category",
      enableSorting: false,
      meta: { label: "Category", className: "w-48" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      cell: ({ row }) => <CategoryPicker tx={row.original} />,
    },
    {
      id: "type",
      accessorKey: "type",
      enableSorting: false,
      meta: { label: "Type", className: "hidden whitespace-nowrap @2xl/data-table:table-cell" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      cell: ({ row }) => <span className="text-muted-foreground">{typeLabel(row.original)}</span>,
    },
    {
      id: "source",
      accessorKey: "source",
      enableSorting: false,
      meta: { label: "Source", className: "hidden whitespace-nowrap @3xl/data-table:table-cell" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />,
      cell: ({ row }) => <span className="text-muted-foreground">{SOURCE_LABEL[row.original.source]}</span>,
    },
    {
      id: "amount",
      accessorKey: "amount",
      meta: { label: "Amount", className: "text-right whitespace-nowrap" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" className="justify-end" />,
      cell: ({ row }) => <TransactionAmount tx={row.original} className="block text-right" />,
    },
    {
      id: "actions",
      enableSorting: false,
      enableHiding: false,
      meta: { className: "w-10" },
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <TransactionRowActions tx={row.original} onShowMerchant={onShowMerchant} />,
    },
  ];
}
