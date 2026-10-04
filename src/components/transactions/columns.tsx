"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { RepeatIcon } from "lucide-react";
import { DataTableColumnHeader } from "@/components/data-table";
import { MerchantIcon } from "@/components/MerchantIcon";
import { Badge } from "@/components/ui/badge";
import { fullDate, money } from "@/lib/format";
import type { TX_TYPES } from "@/lib/search-params";
import type { TransactionItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SOURCE_LABEL, TYPE_LABEL } from "./filters";
import { TransactionRowActions } from "./TransactionRowActions";

/** Column ids that can be sorted match the server's `sort` values. */
export function transactionColumns(onShowMerchant: (merchantKey: string) => void): ColumnDef<TransactionItem>[] {
  return [
    {
      id: "date",
      accessorKey: "date",
      meta: { label: "Date", className: "w-32" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => <span className="tabular whitespace-nowrap text-muted-foreground">{fullDate(row.original.date)}</span>,
    },
    {
      id: "description",
      accessorKey: "description",
      enableHiding: false,
      meta: { label: "Description" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
      cell: ({ row }) => (
        <div className="flex max-w-[22rem] items-center gap-2">
          <MerchantIcon name={row.original.merchantKey.replace(/-/g, " ")} website={row.original.website} size="sm" />
          <span className="truncate font-medium">{row.original.description}</span>
          {row.original.subscriptionKey && (
            <Badge variant="secondary" className="shrink-0 gap-1">
              <RepeatIcon className="size-3" /> Subscription
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "type",
      accessorKey: "type",
      enableSorting: false,
      meta: { label: "Type", className: "w-36" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {TYPE_LABEL[(row.original.type ?? "UNKNOWN") as (typeof TX_TYPES)[number]] ?? row.original.type}
        </span>
      ),
    },
    {
      id: "source",
      accessorKey: "source",
      enableSorting: false,
      meta: { label: "Source", className: "w-28" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />,
      cell: ({ row }) => <span className="text-muted-foreground">{SOURCE_LABEL[row.original.source]}</span>,
    },
    {
      id: "amount",
      accessorKey: "amount",
      meta: { label: "Amount", className: "w-32 text-right" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" className="justify-end" />,
      cell: ({ row }) => {
        const { amount, currency } = row.original;
        return (
          <span className={cn("tabular block text-right font-medium whitespace-nowrap", amount > 0 && "text-[var(--delta-good)]")}>
            {amount > 0 ? "+" : ""}
            {money(amount, currency)}
          </span>
        );
      },
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
