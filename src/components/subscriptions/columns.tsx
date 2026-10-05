"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { BadgeCheckIcon } from "lucide-react";
import { ChargeSparkline } from "@/charts";
import { DataTableColumnHeader } from "@/components/data-table";
import { MerchantIcon } from "@/components/MerchantIcon";
import { CADENCE_LABEL, fullDate, money, relativeDays } from "@/lib/format";
import { isLive } from "@/lib/insights";
import { ColorSwatch } from "./ColorPicker";
import { StatusBadge } from "./StatusBadge";
import { SubscriptionActions } from "./SubscriptionActions";
import { SubscriptionFlags } from "./SubscriptionFlags";
import type { SubscriptionRow } from "./shared";

/** Column ids that can be sorted match the URL's `sort` values; the server does the sorting. */
export function subscriptionColumns(today: string, open: (key: string) => void): ColumnDef<SubscriptionRow>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      enableHiding: false,
      // Takes the leftover width and truncates instead of pushing the table wider.
      meta: { label: "Subscription", className: "w-full max-w-0 min-w-44" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Subscription" />,
      cell: ({ row: { original: s } }) => (
        <div className="flex items-center gap-2.5">
          <ColorSwatch color={s.color} none={s.colorChosen && s.color === null} className="size-2.5" />
          <MerchantIcon name={s.name} website={s.website} />
          <div className="min-w-0">
            {/* The row's keyboard and screen-reader entry point; the row click is a mouse shortcut. */}
            <button
              type="button"
              onClick={() => open(s.key)}
              className="block max-w-full truncate rounded-sm text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
            >
              {s.name}
            </button>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
              {s.category}
              {s.confirmed && <BadgeCheckIcon className="size-3.5 text-[var(--status-good)]" aria-label="Confirmed by you" />}
              <SubscriptionFlags sub={s} />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "cadence",
      accessorKey: "cadence",
      enableSorting: false,
      meta: { label: "Billing", className: "hidden whitespace-nowrap @3xl/data-table:table-cell" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Billing" />,
      cell: ({ row }) => <span className="text-muted-foreground">{CADENCE_LABEL[row.original.cadence]}</span>,
    },
    {
      id: "amount",
      accessorKey: "amount",
      meta: { label: "Price", className: "text-right whitespace-nowrap" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Price" className="justify-end" />,
      cell: ({ row }) => <span className="tabular block text-right font-medium">{money(row.original.amount, row.original.currency)}</span>,
    },
    {
      id: "monthlyCost",
      accessorKey: "monthlyCost",
      meta: { label: "Per month", className: "hidden text-right whitespace-nowrap @2xl/data-table:table-cell" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Per month" className="justify-end" />,
      cell: ({ row: { original: s } }) => (
        <span className="tabular block text-right text-muted-foreground">
          {money(s.netMonthlyCost, s.currency)}
          {s.reimbursement && <span className="block text-xs">of {money(s.monthlyCost, s.currency)}</span>}
        </span>
      ),
    },
    {
      id: "nextCharge",
      accessorKey: "nextCharge",
      meta: { label: "Next charge", className: "whitespace-nowrap" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Next charge" />,
      cell: ({ row: { original: s } }) =>
        s.nextCharge ? (
          <div>
            <div>{fullDate(s.nextCharge)}</div>
            <div className="text-xs text-muted-foreground">{relativeDays(s.nextCharge, today)}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">Last {fullDate(s.lastCharge)}</span>
        ),
    },
    {
      id: "history",
      enableSorting: false,
      meta: { label: "History", className: "hidden @4xl/data-table:table-cell" },
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
      meta: { label: "Status", className: "whitespace-nowrap" },
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
