// Shapes shared between route handlers, server prefetching and client components.

import type { SeriesColor } from "./color";

export type Cadence = "weekly" | "monthly" | "quarterly" | "semiannual" | "yearly";
export type SubStatus = "active" | "late" | "inactive" | "cancelled";

export type ReimbursementMode = "request" | "automatic";

/**
 * What came back (or should come back) for one charge, derived from the subscription's
 * reimbursement periods and anything the user recorded:
 * - `recorded`: the user said what came back (`amount` 0 = not reimbursed); always wins.
 * - `assumed`: an automatic source pays it, so the expected amount counts as reimbursed.
 * - `pending`: a request source should pay it, but nothing is recorded yet.
 * - `none`: not reimbursable (before the first period, or after "Stop reimbursing").
 */
export type ChargeReimbursement = {
  status: "recorded" | "assumed" | "pending" | "none";
  /** Recorded, assumed or pending amount; 0 for `none`. */
  amount: number;
  /** What the period in force expects back for this charge (capped at the charge); null = not reimbursable. */
  expected: number | null;
  /** Source of the period in force, if it has one. */
  sourceId: number | null;
};

export type Charge = {
  date: string;
  amount: number;
  /** Absent when the charge is not reimbursable and nothing was recorded for it. */
  reimbursement?: ChargeReimbursement;
};
export type PriceChange = { date: string; from: number; to: number };

export type Subscription = {
  key: string;
  merchantKey: string;
  name: string;
  category: string;
  currency: string;
  cadence: Cadence;
  /** True when the user set `cadence` themselves rather than leaving it to detection. */
  cadenceChosen: boolean;
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
  /** Website the logo comes from (e.g. "netflix.com"): the user's, else the built-in one; null = initials. */
  website: string | null;
  /** True when the user set `website` themselves. */
  websiteChosen: boolean;
  priceChanges: PriceChange[];
  charges: Charge[];
  /** The reimbursement period in force today; null = not reimbursed (never set up, or stopped). */
  reimbursement: ReimbursementPeriod | null;
  /** Every reimbursement period, newest first (stops included, upcoming ones too). */
  reimbursementPeriods: ReimbursementPeriod[];
  /** `monthlyCost` minus what the current period expects back — what it really costs you. */
  netMonthlyCost: number;
  /** Recorded plus assumed reimbursements over all its charges. */
  totalReimbursed: number;
  /** Charges a request source should pay back that have nothing recorded yet. */
  pendingReimbursements: number;
};

/** One stretch of time a subscription is (or stops being) reimbursed, until the next period. */
export type ReimbursementPeriod = {
  id: number;
  /** YYYY-MM-DD; applies to charges on or after this day. */
  startsOn: string;
  /** Expected back per charge, in the subscription's currency; 0 for a stop. */
  amount: number;
  /** null = "Stop reimbursing" from `startsOn`. */
  source: { id: number; name: string; mode: ReimbursementMode } | null;
};

/** Where reimbursements come from, e.g. "Salary" (you file a request) or an insurer that pays automatically. */
export type ReimbursementSource = {
  id: number;
  name: string;
  mode: ReimbursementMode;
  /** Day of the month (1–28) to be reminded to file requests; request sources only. */
  reminderDay: number | null;
  /**
   * Subscriptions with any period from this source; `current` = it pays them today. `periods` are
   * that subscription's periods from this source (oldest first), so they can be removed from here.
   */
  subscriptions: { key: string; name: string; current: boolean; periods: { id: number; startsOn: string }[] }[];
  /** Charges from this source with nothing recorded yet (request sources only). */
  pending: number;
};

export type ReimbursementSourcesPayload = { sources: ReimbursementSource[] };

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
  /** Reimbursed per month (recorded + assumed, by charge date), in the base currency. */
  reimbursed: number[];
};

export type TransactionItem = {
  id: string;
  date: string;
  description: string;
  merchantKey: string;
  /** Website the logo comes from (see Subscription.website); null = initials. */
  website: string | null;
  amount: number;
  currency: string;
  type: string | null;
  source: "csv" | "bank";
  subscriptionKey: string | null;
  /**
   * Set on the one payment that stands for its subscription charge (a charge day can have a fee
   * line too). Absent on other payments.
   */
  reimbursement?: ChargeReimbursement;
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
