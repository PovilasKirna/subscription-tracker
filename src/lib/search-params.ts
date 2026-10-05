import {
  createLoader,
  createSerializer,
  type inferParserType,
  parseAsArrayOf,
  parseAsInteger,
  parseAsNumberLiteral,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

// Type-safe URL state (nuqs). The same parsers are read on the server (to prefetch the
// right query), by the API route (to parse the request) and on the client (useQueryStates),
// so all three always agree.

/** Monthly recurring spend: the last N months, or January to now ("ytd"). */
export const HISTORY_RANGES = ["6m", "12m", "24m", "ytd"] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];
/** Spend by merchant: the last 12 months, or January to now. */
export const MERCHANT_RANGES = ["12m", "ytd"] as const;
export type MerchantRange = (typeof MERCHANT_RANGES)[number];
/** The renewals calendar steps forward a month at a time, at most this far. */
export const RENEWAL_MONTHS_AHEAD = 12;

export const overviewParams = {
  range: parseAsStringLiteral(HISTORY_RANGES).withDefault("12m"),
  merchants: parseAsStringLiteral(MERCHANT_RANGES).withDefault("12m"),
  /** Months past the current one shown in the renewals calendar (0 = this month). */
  ahead: parseAsInteger.withDefault(0),
};

/** Months a range covers, ending with the current month (`today` is YYYY-MM-DD). */
export function rangeMonths(range: HistoryRange, today: string): number {
  return range === "ytd" ? Number(today.slice(5, 7)) : Number.parseInt(range, 10);
}

// ---------- shared table constants ----------
export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export const PAGE_SIZES = [10, 25, 50, 100] as const;

// ---------- subscriptions data table ----------
/** Row statuses; "ignored" rows are only shown when that status is filtered for. */
export const SUB_STATUSES = ["active", "late", "inactive", "cancelled", "ignored"] as const;
export const CADENCES = ["weekly", "monthly", "quarterly", "semiannual", "yearly"] as const;
export const SUB_SORT_COLUMNS = ["name", "amount", "monthlyCost", "nextCharge", "status"] as const;

export const subscriptionParams = {
  q: parseAsString.withDefault(""),
  status: parseAsArrayOf(parseAsStringLiteral(SUB_STATUSES)).withDefault([]),
  cadence: parseAsArrayOf(parseAsStringLiteral(CADENCES)).withDefault([]),
  category: parseAsArrayOf(parseAsString).withDefault([]),
  sort: parseAsStringLiteral(SUB_SORT_COLUMNS).withDefault("status"),
  dir: parseAsStringLiteral(SORT_DIRECTIONS).withDefault("asc"),
  page: parseAsInteger.withDefault(1),
  perPage: parseAsNumberLiteral(PAGE_SIZES).withDefault(25),
};
export type SubscriptionFilters = inferParserType<typeof subscriptionParams>;
/** Builds the query string for /api/subscriptions/table from the same parsers. */
export const serializeSubscriptionParams = createSerializer(subscriptionParams);
/** The open detail drawer (?sub=merchant|currency). Shared by every page that links to it. */
export const subscriptionDrawerParams = { sub: parseAsString };
export const loadSubscriptionDrawerParams = createLoader(subscriptionDrawerParams);

// ---------- transactions data table ----------
export const TX_SORT_COLUMNS = ["date", "amount", "description"] as const;
/** Amount sign: money coming in (+) or going out (−). */
export const FLOWS = ["in", "out"] as const;
export const SOURCES = ["csv", "bank"] as const;
/** Whether a charge belongs to a detected subscription. */
export const SUBSCRIPTION_MEMBERSHIP = ["subscription", "other"] as const;
/** Revolut types plus "UNKNOWN" for bank rows without a recognisable code. */
export const TX_TYPES = ["CARD_PAYMENT", "TRANSFER", "TOPUP", "EXCHANGE", "FEE", "ATM", "CARD_REFUND", "REFUND", "UNKNOWN"] as const;

export const transactionParams = {
  q: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
  perPage: parseAsNumberLiteral(PAGE_SIZES).withDefault(25),
  sort: parseAsStringLiteral(TX_SORT_COLUMNS).withDefault("date"),
  dir: parseAsStringLiteral(SORT_DIRECTIONS).withDefault("desc"),
  flow: parseAsArrayOf(parseAsStringLiteral(FLOWS)).withDefault([]),
  type: parseAsArrayOf(parseAsStringLiteral(TX_TYPES)).withDefault([]),
  source: parseAsArrayOf(parseAsStringLiteral(SOURCES)).withDefault([]),
  sub: parseAsArrayOf(parseAsStringLiteral(SUBSCRIPTION_MEMBERSHIP)).withDefault([]),
};
export type TransactionFilters = inferParserType<typeof transactionParams>;
/** Builds the query string for /api/transactions from the same parsers. */
export const serializeTransactionParams = createSerializer(transactionParams);

export const dataParams = {
  bank: parseAsString,
  reason: parseAsString,
};

export const loadOverviewParams = createLoader(overviewParams);
export const loadTransactionParams = createLoader(transactionParams);
export const loadSubscriptionParams = createLoader(subscriptionParams);
