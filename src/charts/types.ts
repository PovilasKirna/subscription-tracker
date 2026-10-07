// Chart datum types, derived from the API response types so a renamed API field
// breaks `npm run typecheck` here instead of silently rendering nothing.
import type { HistoryPayload, InvestmentsPayload, NetWorthPayload, SpendingPayload, Subscription, SubscriptionsPayload } from "@/lib/types";

type HistorySeries = HistoryPayload["series"][number];

/** YYYY-MM month key as returned by /api/history. */
export type Month = HistoryPayload["months"][number];

/** A categorical colour slot (1–8), a custom hex colour, or null for the neutral "Other". */
export type SeriesColor = Subscription["color"];

/** One stack layer of SpendColumns. */
export type SeriesMeta<K extends string> = {
  key: K;
  name: HistorySeries["name"];
  color: HistorySeries["color"];
};

/** One column of SpendColumns: a month plus one value per series key. */
export type MonthlySpend<K extends string> = { month: Month; total: HistoryPayload["totals"][number] } & {
  [P in K]: HistorySeries["values"][number];
};

/** One row of SubscriptionTimeline. */
export type TimelineRow = Pick<
  Subscription,
  "key" | "name" | "currency" | "color" | "status" | "firstCharge" | "lastCharge" | "charges" | "priceChanges"
>;
export type TimelineCharge = TimelineRow["charges"][number];

/** One projected charge on the RenewalCalendar. */
export type ExpectedCharge = {
  date: Subscription["lastCharge"];
  key: Subscription["key"];
  name: Subscription["name"];
  amount: Subscription["amount"];
  currency: Subscription["currency"];
  color: SeriesColor;
  /** Domain the logo comes from; null = initials. */
  website: Subscription["website"];
};

/** Today's date as the server saw it (keeps SSR and hydration in agreement). */
export type Today = SubscriptionsPayload["today"];

/** Typed accessor — charts take functions, never string keys. */
export type Accessor<T, R> = (d: T) => R;

/** One day of NetWorthLine. */
export type NetWorthDay = NetWorthPayload["history"][number];

type SpendingPoint = SpendingPayload["points"][number];
/** Axis label (e.g. "5", "Mon", "Oct") and tooltip title (e.g. "5 Oct 2026") of a point. */
type PointLabels = { label: string; title: string };
/** One point of SpendingPace: running totals. */
export type SpendingPacePoint = PointLabels & Pick<SpendingPoint, "spent" | "previous" | "projected">;
/** One bar of SpendingBars: the point's own amounts. */
export type SpendingBarPoint = PointLabels & Pick<SpendingPoint, "amount" | "previousAmount" | "projectedAmount">;

/** One day of InvestmentLine (account currency). */
export type InvestmentDay = InvestmentsPayload["history"][number];
