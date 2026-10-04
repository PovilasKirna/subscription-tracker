// Shapes shared between route handlers, server prefetching and client components.

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
  known: boolean;
  /**
   * Fixed categorical colour slot (1–7) for the 7 biggest subscriptions, ordered by first-seen
   * date so it never changes with filters, or the one the user picked (1–8, see `colorChosen`).
   * `null` = folded into "Other".
   */
  colorSlot: number | null;
  /** True when the user picked `colorSlot` themselves rather than leaving it automatic. */
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
  /** Ordered by colour slot; the "Other" fold (slot null) is last. */
  series: { key: string; name: string; slot: number | null; values: number[] }[];
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
  imports: { at: string; source: string; inserted: number; updated: number; skipped: number; message: string | null }[];
};
