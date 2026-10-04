"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { BadgeCheckIcon } from "lucide-react";
import { ChargeSparkline } from "@/charts";
import { DataTableColumnHeader } from "@/components/data-table";
import { MerchantIcon } from "@/components/MerchantIcon";
import { Badge } from "@/components/ui/badge";
import { CADENCE_LABEL, fullDate, money, relativeDays } from "@/lib/format";
import { isLive } from "@/lib/insights";
import { ColorSwatch } from "./ColorPicker";
import { StatusBadge } from "./StatusBadge";
import { SubscriptionActions } from "./SubscriptionActions";
import type { SubscriptionRow } from "./shared";

/** Column ids that can be sorted match the URL's `sort` values; the server does the sorting. */
export function subscriptionColumns(today: string, open: (key: string) => void): ColumnDef<SubscriptionRow>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      enableHiding: false,
      meta: { label: "Subscription" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Subscription" />,
      cell: ({ row: { original: s } }) => (
        <div className="flex max-w-[18rem] items-center gap-2.5">
          <ColorSwatch color={s.color} none={s.colorChosen && s.color === null} className="size-2.5" />
          <MerchantIcon name={s.name} website={s.website} />
          <div className="min-w-0">
            <div className="truncate font-medium">{s.name}</div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {s.category}
              {s.confirmed && <BadgeCheckIcon className="size-3.5 text-[var(--status-good)]" aria-label="Confirmed by you" />}
              {s.priceChanges.length > 0 && (
                <Badge variant="outline" className="h-4 px-1 text-[10px]">
                  {s.priceChanges.length} price change{s.priceChanges.length > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "cadence",
      accessorKey: "cadence",
      enableSorting: false,
      meta: { label: "Billing", className: "hidden md:table-cell" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Billing" />,
      cell: ({ row }) => <span className="text-muted-foreground">{CADENCE_LABEL[row.original.cadence]}</span>,
    },
    {
      id: "amount",
      accessorKey: "amount",
      meta: { label: "Price", className: "text-right" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Price" className="justify-end" />,
      cell: ({ row }) => <span className="tabular block text-right font-medium">{money(row.original.amount, row.original.currency)}</span>,
    },
    {
      id: "monthlyCost",
      accessorKey: "monthlyCost",
      meta: { label: "Per month", className: "hidden text-right sm:table-cell" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Per month" className="justify-end" />,
      cell: ({ row }) => (
        <span className="tabular block text-right text-muted-foreground">{money(row.original.monthlyCost, row.original.currency)}</span>
      ),
    },
    {
      id: "nextCharge",
      accessorKey: "nextCharge",
      meta: { label: "Next charge", className: "hidden lg:table-cell" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Next charge" />,
      cell: ({ row: { original: s } }) =>
        s.nextCharge ? (
          <div>
            <div className="whitespace-nowrap">{fullDate(s.nextCharge)}</div>
            <div className="text-xs text-muted-foreground">{relativeDays(s.nextCharge, today)}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">Last {fullDate(s.lastCharge)}</span>
        ),
    },
    {
      id: "history",
      enableSorting: false,
      meta: { label: "History", className: "hidden xl:table-cell" },
      header: () => "History",
      cell: ({ row: { original: s } }) => (
        <ChargeSparkline
          charges={s.charges.slice(-12)}
          color={s.color}
          muted={!isLive(s)}
          formatValue={(n) => money(n, s.currency)}
          formatDate={fullDate}
        />
      ),
    },
    {
      id: "status",
      accessorKey: "rowStatus",
      meta: { label: "Status" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <StatusBadge status={row.original.rowStatus} />,
    },
    {
      id: "actions",
      enableSorting: false,
      enableHiding: false,
      meta: { className: "w-10" },
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <SubscriptionActions sub={row.original} onOpen={() => open(row.original.key)} />,
    },
  ];
}
