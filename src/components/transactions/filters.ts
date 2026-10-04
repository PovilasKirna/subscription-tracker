import { ArrowDownLeftIcon, ArrowLeftRightIcon, ArrowUpRightIcon, DatabaseIcon, RepeatIcon, TagIcon } from "lucide-react";
import type { FilterDef } from "@/components/data-table";
import { FLOWS, SOURCES, SUBSCRIPTION_MEMBERSHIP, TX_TYPES } from "@/lib/search-params";
import type { TransactionItem } from "@/lib/types";

// Filter dimensions for the transactions table (filtering itself runs on the server).

export const TYPE_LABEL: Record<(typeof TX_TYPES)[number], string> = {
  CARD_PAYMENT: "Card payment",
  TRANSFER: "Transfer",
  TOPUP: "Top-up",
  EXCHANGE: "Exchange",
  FEE: "Fee",
  ATM: "Cash withdrawal",
  CARD_REFUND: "Card refund",
  REFUND: "Refund",
  UNKNOWN: "Other",
};
export const SOURCE_LABEL: Record<(typeof SOURCES)[number], string> = { csv: "CSV import", bank: "Bank sync" };

export const TRANSACTION_FILTERS = [
  {
    key: "flow",
    label: "Amount",
    noun: "directions",
    icon: ArrowLeftRightIcon,
    options: [
      { value: FLOWS[0], label: "Money in (+)", icon: ArrowDownLeftIcon },
      { value: FLOWS[1], label: "Money out (−)", icon: ArrowUpRightIcon },
    ],
  },
  {
    key: "sub",
    label: "Subscription",
    noun: "options",
    icon: RepeatIcon,
    options: [
      { value: SUBSCRIPTION_MEMBERSHIP[0], label: "Subscription charges" },
      { value: SUBSCRIPTION_MEMBERSHIP[1], label: "Everything else" },
    ],
  },
  { key: "type", label: "Type", noun: "types", icon: TagIcon, options: TX_TYPES.map((value) => ({ value, label: TYPE_LABEL[value] })) },
  {
    key: "source",
    label: "Source",
    noun: "sources",
    icon: DatabaseIcon,
    options: SOURCES.map((value) => ({ value, label: SOURCE_LABEL[value] })),
  },
] as const satisfies readonly FilterDef<TransactionItem>[];

export type TransactionFilterKey = (typeof TRANSACTION_FILTERS)[number]["key"];
