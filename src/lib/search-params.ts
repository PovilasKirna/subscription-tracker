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
import { CATEGORY_IDS } from "./categories";

// Type-safe URL state (nuqs). The same parsers are read on the server (to prefetch the
// right query), by the API route (to parse the request) and on the client (useQueryStates),
// so all three always agree.

/** Overview period, shared by monthly recurring spend and spend by merchant: the last 12 months, or January to now. */
export const OVERVIEW_RANGES = ["12m", "ytd"] as const;
export type OverviewRange = (typeof OVERVIEW_RANGES)[number];
/** The renewals calendar steps forward a month at a time, at most this far. */
export const RENEWAL_MONTHS_AHEAD = 12;

export const overviewParams = {
  range: parseAsStringLiteral(OVERVIEW_RANGES).withDefault("12m"),
  /** Months past the current one shown in the renewals calendar (0 = this month). */
  ahead: parseAsInteger.withDefault(0),
};

/** Months a range covers, ending with the current month (`today` is YYYY-MM-DD). */
export function rangeMonths(range: OverviewRange, today: string): number {
  return range === "ytd" ? Number(today.slice(5, 7)) : Number.parseInt(range, 10);
}

// ---------- shared table constants ----------
export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
/** Rows per page when the URL has no `perPage`: the server and desktops use 25, phones 10. */
export const DEFAULT_PAGE_SIZE: PageSize = 25;
export const PHONE_PAGE_SIZE: PageSize = 10;

/** The page size in effect: an explicit `?perPage` always wins; otherwise phones get a shorter page. */
export function effectivePageSize(explicit: PageSize | null, phone: boolean): PageSize {
  return explicit ?? (phone ? PHONE_PAGE_SIZE : DEFAULT_PAGE_SIZE);
}

/**
 * `perPage` as the client reads it: no default, so `null` means the URL doesn't say and the device
 * default applies (see `effectivePageSize`). The server loader keeps `DEFAULT_PAGE_SIZE`.
 */
export const clientPerPageParam = parseAsNumberLiteral(PAGE_SIZES);

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
  perPage: parseAsNumberLiteral(PAGE_SIZES).withDefault(DEFAULT_PAGE_SIZE),
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
  perPage: parseAsNumberLiteral(PAGE_SIZES).withDefault(DEFAULT_PAGE_SIZE),
  sort: parseAsStringLiteral(TX_SORT_COLUMNS).withDefault("date"),
  dir: parseAsStringLiteral(SORT_DIRECTIONS).withDefault("desc"),
  flow: parseAsArrayOf(parseAsStringLiteral(FLOWS)).withDefault([]),
  type: parseAsArrayOf(parseAsStringLiteral(TX_TYPES)).withDefault([]),
  source: parseAsArrayOf(parseAsStringLiteral(SOURCES)).withDefault([]),
  sub: parseAsArrayOf(parseAsStringLiteral(SUBSCRIPTION_MEMBERSHIP)).withDefault([]),
  category: parseAsArrayOf(parseAsStringLiteral(CATEGORY_IDS)).withDefault([]),
  /** One calendar month (YYYY-MM); "" = all time. */
  month: parseAsString.withDefault(""),
  /** A date range (YYYY-MM-DD, inclusive), e.g. a period on the Spending page; "" = open-ended. */
  from: parseAsString.withDefault(""),
  to: parseAsString.withDefault(""),
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

/** Table params as the client hooks read them: `perPage` is null when the URL doesn't set it. */
export const subscriptionClientParams = { ...subscriptionParams, perPage: clientPerPageParam };
export const transactionClientParams = { ...transactionParams, perPage: clientPerPageParam };

// ---------- spending ----------
export const SPENDING_RANGES = ["1w", "1m", "6m", "1y"] as const;
export const SPENDING_VIEWS = ["line", "bar"] as const;
export const spendingParams = {
  range: parseAsStringLiteral(SPENDING_RANGES).withDefault("1m"),
  /** A day inside the period shown (YYYY-MM-DD); "" = the current one. */
  at: parseAsString.withDefault(""),
  /** Chart style; the data is the same either way. */
  view: parseAsStringLiteral(SPENDING_VIEWS).withDefault("line"),
};
export const loadSpendingParams = createLoader(spendingParams);
