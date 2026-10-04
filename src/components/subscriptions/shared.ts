import { CalendarClockIcon, CircleDotIcon, TagIcon } from "lucide-react";
import type { FilterDef } from "@/components/data-table";
import { CADENCE_LABEL } from "@/lib/format";
import { CADENCES, SUB_STATUSES } from "@/lib/search-params";
import type { SubscriptionRow, SubscriptionRowStatus } from "@/lib/types";

export const CATEGORIES = [
  "Streaming",
  "Music & audio",
  "Software & AI",
  "Cloud storage",
  "Gaming",
  "News & reading",
  "Fitness",
  "Telecom & internet",
  "Banking & finance",
  "Delivery & mobility",
  "Utilities & home",
  "Other",
] as const;

export type { SubscriptionRow };
export type RowStatus = SubscriptionRowStatus;

export const STATUS_LABEL: Record<RowStatus, string> = {
  active: "Active",
  late: "Overdue",
  inactive: "Stopped",
  cancelled: "Cancelled",
  ignored: "Ignored",
};

/**
 * Filter dimensions (filtering runs on the server). Categories come from the server payload so
 * only ones in use are offered.
 */
export function subscriptionFilters(categories: readonly string[]): FilterDef<SubscriptionRow>[] {
  return [
    {
      key: "status",
      label: "Status",
      noun: "statuses",
      icon: CircleDotIcon,
      options: SUB_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] })),
    },
    {
      key: "cadence",
      label: "Billing",
      noun: "cadences",
      icon: CalendarClockIcon,
      options: CADENCES.map((value) => ({ value, label: CADENCE_LABEL[value] })),
    },
    {
      key: "category",
      label: "Category",
      noun: "categories",
      icon: TagIcon,
      options: categories.map((value) => ({ value, label: value })),
    },
  ];
}
