import { config } from "./config";

// Client for the Trading 212 public API (https://docs.trading212.com/api). Read-only use: the
// account summary (cash + investments) and open positions. Values come in the account's primary
// currency. Rate limits: summary 1 request / 5 s, positions 1 / 1 s — fine for an hourly tick.

export class Trading212Error extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type T212Summary = {
  id: number;
  currency: string;
  totalValue: number;
  cash?: { availableToTrade?: number; inPies?: number; reservedForOrders?: number } | null;
  investments?: { currentValue?: number; totalCost?: number; unrealizedProfitLoss?: number; realizedProfitLoss?: number } | null;
};

export type T212Position = {
  quantity: number;
  currentPrice?: number;
  averagePricePaid?: number;
  instrument?: { ticker?: string; name?: string; isin?: string; currency?: string } | null;
  walletImpact?: { currency?: string; currentValue?: number; totalCost?: number; unrealizedProfitLoss?: number } | null;
};

function authorization(): string {
  const { apiKey, apiSecret } = config.trading212;
  // Key + secret pairs use HTTP Basic; older single keys go in the header as they are.
  return apiSecret ? `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}` : apiKey;
}

const MESSAGES: Record<number, string> = {
  401: "Trading 212 rejected the API key — check TRADING212_API_KEY / TRADING212_API_SECRET.",
  403: "The Trading 212 API key is missing a permission — enable “Account data” and “Portfolio” for it.",
  408: "Trading 212 timed out.",
  429: "Trading 212 rate limit reached — try again in a few seconds.",
};

async function call<T>(path: string): Promise<T> {
  const res = await fetch(`${config.trading212.apiUrl}/api/v0${path}`, {
    headers: { Authorization: authorization() },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Trading212Error(MESSAGES[res.status] ?? `Trading 212 ${res.status}: ${text.slice(0, 200)}`, res.status);
  }
  return (await res.json()) as T;
}

export const fetchSummary = () => call<T212Summary>("/equity/account/summary");
export const fetchPositions = () => call<T212Position[]>("/equity/positions");

export type T212CashFlow = {
  reference: string;
  type: string; // WITHDRAW | DEPOSIT | FEE | TRANSFER | INTEREST_ON_FREE_CASH | LENDING_INTEREST
  amount: number;
  currency: string;
  dateTime: string;
};
type CashFlowPage = { items: T212CashFlow[]; nextPagePath?: string | null };

/**
 * One page (newest first) of money moving in and out. `next` is the `nextPagePath` of the previous
 * page. Needs the "History" permission (403 without it). Rate limit: 20 requests a minute.
 */
export function fetchCashFlowPage(next?: string | null): Promise<CashFlowPage> {
  // nextPagePath is "/api/v0/equity/history/transactions?cursor=…"; call() adds the /api/v0 prefix.
  const path = next ? next.replace(/^\/api\/v0/, "") : "/equity/history/transactions?limit=50";
  return call<CashFlowPage>(path);
}

/** Money paid in (+) or taken out (−); null for interest and fees, which are returns, not deposits. Pure. */
export function depositAmount(f: Pick<T212CashFlow, "type" | "amount">): number | null {
  if (f.type === "DEPOSIT") return Math.abs(f.amount);
  if (f.type === "WITHDRAW") return -Math.abs(f.amount);
  if (f.type === "TRANSFER") return f.amount; // between your own Trading 212 accounts; signed by the API
  return null;
}

/** One position as stored with the day's value (and shown on the Investments page). */
export type StoredPosition = { ticker: string; name: string; value: number; cost: number | null; profitLoss: number | null };

/** What gets stored for a brokerage account: its value plus the breakdown. Pure. */
export function summarize(summary: T212Summary, positions: T212Position[] | null) {
  const cash = summary.cash ?? {};
  const inv = summary.investments ?? {};
  const cashTotal = (cash.availableToTrade ?? 0) + (cash.inPies ?? 0) + (cash.reservedForOrders ?? 0);
  const invested = inv.currentValue ?? 0;
  // totalValue is the account value; fall back to the parts if it's ever missing.
  const total = Number.isFinite(summary.totalValue) ? summary.totalValue : cashTotal + invested;
  const stored: StoredPosition[] | null = positions
    ? positions
        .map((p) => ({
          ticker: p.instrument?.ticker ?? "?",
          name: p.instrument?.name ?? p.instrument?.ticker ?? "Unknown",
          value: p.walletImpact?.currentValue ?? p.quantity * (p.currentPrice ?? 0),
          cost: p.walletImpact?.totalCost ?? (p.averagePricePaid !== undefined ? p.quantity * p.averagePricePaid : null),
          profitLoss: p.walletImpact?.unrealizedProfitLoss ?? null,
        }))
        // All of them: the page limits what it shows, and shares are worked out against the whole portfolio.
        .sort((a, b) => b.value - a.value)
    : null;
  return {
    accountId: String(summary.id),
    currency: summary.currency.toUpperCase(),
    amountMinor: Math.round(total * 100),
    detail: {
      cash: cashTotal,
      invested,
      cost: inv.totalCost ?? null,
      profitLoss: inv.unrealizedProfitLoss ?? null,
      realizedProfitLoss: inv.realizedProfitLoss ?? null,
      positions: stored,
    },
  };
}
