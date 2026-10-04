// Shapes shared between route handlers, server prefetching and client components.

import type { SeriesColor } from "./color";

export type Cadence = "weekly" | "monthly" | "quarterly" | "semiannual" | "yearly";
export type SubStatus = "active" | "late" | "inactive" | "cancelled";

export type Charge = { date: string; amount: number };
export type PriceChange = { date: string; from: number; to: number };

export type Subscription = {
  key: string;
  merchantKey: string;
  name: string;
  category: string;
  currency: string;
  cadence: Cadence;
  periodDays: number;
  /** Latest charged amount, positive, in major units. */
  amount: number;
  monthlyCost: number;
  yearlyCost: number;
  firstCharge: string;
  lastCharge: string;
  nextCharge: string | null;
  chargeCount: number;
  totalSpent: number;
  status: SubStatus;
  /** 0..1 — how sure the detector is this is a real subscription. */
  confidence: number;
  confirmed: boolean;
  /** The user assigned charges by hand; membership no longer depends on detection. */
  pinned: boolean;
  known: boolean;
  /**
   * Fixed categorical colour slot (1–7) for the 7 biggest subscriptions, ordered by first-seen
   * date so it never changes with filters, or the colour the user picked (a slot 1–8 or a custom
   * hex, see `colorChosen`). `null` = neutral grey, folded into "Other".
   */
  color: SeriesColor;
  /** True when the user picked `color` themselves (including "none") rather than leaving it automatic. */
  colorChosen: boolean;
  priceChanges: PriceChange[];
  charges: Charge[];
};

export type SubscriptionsPayload = {
  baseCurrency: string;
  today: string;
  subscriptions: Subscription[];
  ignored: Subscription[];
};

export type SubscriptionRowStatus = SubStatus | "ignored";
/** A subscriptions-table row: a subscription plus whether the user ignored it. */
export type SubscriptionRow = Subscription & { rowStatus: SubscriptionRowStatus };

export type SubscriptionsTablePayload = {
  today: string;
  /** The current page. `charges` holds only the most recent 12 (what the sparkline draws). */
  items: SubscriptionRow[];
  /** Rows matching the filters (all pages). */
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** Detected (not ignored) subscriptions overall, to tell "nothing yet" from "nothing matches". */
  detected: number;
  /** Every category in use (ignored rows included), for the filter menu. */
  categories: string[];
  /** Per-value counts for the filter menu; each ignores its own dimension (see TransactionsPayload). */
  facets: {
    status: Record<string, number>;
    cadence: Record<string, number>;
    category: Record<string, number>;
  };
};

export type HistoryPayload = {
  baseCurrency: string;
  months: string[]; // YYYY-MM
  /** Ordered by colour slot, then custom colours; the "Other" fold (colour null) is last. */
  series: { key: string; name: string; color: SeriesColor; values: number[] }[];
  totals: number[];
  /** All money out per month (excl. transfers/exchanges), for context. */
  allSpending: number[];
};

export type TransactionItem = {
  id: string;
  date: string;
  description: string;
  merchantKey: string;
  amount: number;
  currency: string;
  type: string | null;
  source: "csv" | "bank";
  subscriptionKey: string | null;
};

export type TransactionsPayload = {
  items: TransactionItem[];
  /** Rows matching the filters (all pages). */
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /**
   * Per-value counts for the filter menu, computed over rows matching the search and every
   * *other* filter, so each count says how many rows picking that value would show.
   */
  facets: {
    flow: Record<string, number>;
    type: Record<string, number>;
    source: Record<string, number>;
    sub: Record<string, number>;
  };
};

export type SubscriptionDetailPayload = {
  baseCurrency: string;
  today: string;
  /** null when the key no longer matches a detected subscription (e.g. all charges excluded). */
  subscription: Subscription | null;
  ignored: boolean;
  /** Charges counted towards this subscription, newest first. */
  transactions: TransactionItem[];
  /** Charges from the same merchant that the user removed from the subscription. */
  excluded: TransactionItem[];
  /** Other payments to the same merchant that aren't counted here (e.g. after a plan change). */
  related: RelatedTransaction[];
};

/** A payment that could belong to a subscription but isn't counted in it. */
export type RelatedTransaction = TransactionItem & {
  /** Same price as the charge or subscription it's being compared with. */
  similar: boolean;
  /** Name of the subscription it currently counts towards, if any. */
  subscriptionName: string | null;
};

/** A subscription offered as a target in the "Add to subscription" dialog. */
export type AssignTarget = Pick<Subscription, "key" | "name" | "amount" | "currency" | "cadence" | "status"> & {
  /** Same merchant as the transaction being added (listed first). */
  sameMerchant: boolean;
};

export type AssignOptionsPayload = {
  transaction: TransactionItem;
  /** Name a new subscription started from this payment would get. */
  newName: string;
  /** Subscriptions in the same currency, same-merchant ones first. */
  targets: AssignTarget[];
  /** Other outgoing payments to the same merchant, newest first. */
  related: RelatedTransaction[];
};

export type BankSession = {
  sessionId: string;
  aspsp: string;
  country: string;
  validUntil: string | null;
  accounts: { uid: string; name: string | null; iban: string | null; currency: string | null }[];
  lastSyncAt: string | null;
  lastError: string | null;
  /** "needs_reconnect" when consent expired or was revoked in the Revolut app. */
  status: "active" | "needs_reconnect";
  /** After a bank rate limit, background sync resumes at this time. */
  nextRetryAt: string | null;
};

export type DataStatusPayload = {
  transactionCount: number;
  firstDate: string | null;
  lastDate: string | null;
  bankConfigured: boolean;
  syncIntervalHours: number;
  /** A bank sync is running right now (e.g. the first full-history sync after connecting). */
  syncing: boolean;
  sessions: BankSession[];
  imports: { id: number; at: string; source: string; inserted: number; updated: number; skipped: number; message: string | null }[];
};
