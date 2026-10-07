// Local stand-in for the Trading 212 public API, so the Net worth page can be tried without a real
// account:   npm run mock:t212
//
// Then add to .env.local and restart `npm run dev`:
//   TRADING212_API_KEY=mock
//   TRADING212_API_SECRET=mock
//   TRADING212_API_URL=http://localhost:4020
//
// Serves the endpoints the app reads (account summary, open positions, deposit history) with HTTP
// Basic auth, prices drifting a little on every call. MOCK_T212_SCOPES=account leaves out
// "portfolio" and "history" (403s), to see how the pages cope with a key that can't read them.
import { createServer, type ServerResponse } from "node:http";

const PORT = Number(process.env.MOCK_T212_PORT ?? 4020);
const EXPECTED = `Basic ${Buffer.from("mock:mock").toString("base64")}`;
const SCOPES = (process.env.MOCK_T212_SCOPES ?? "account,portfolio,history").split(",");

const HOLDINGS = [
  { ticker: "VUAAm_EQ", name: "Vanguard S&P 500 (Acc)", quantity: 41.2, cost: 3920, price: 104.6 },
  { ticker: "IWDA_EQ", name: "iShares Core MSCI World", quantity: 22.5, cost: 1980, price: 96.1 },
  { ticker: "AAPL_US_EQ", name: "Apple", quantity: 3.1, cost: 540, price: 218.4 },
  { ticker: "ASML_EQ", name: "ASML Holding", quantity: 0.8, cost: 610, price: 702.3 },
  { ticker: "NVDA_US_EQ", name: "NVIDIA", quantity: 4, cost: 390, price: 128.9 },
  { ticker: "EQQQ_EQ", name: "Invesco EQQQ Nasdaq-100", quantity: 1.6, cost: 640, price: 452.7 },
];
const CASH = { availableToTrade: 312.48, inPies: 0, reservedForOrders: 25 };

// Deposit history, newest first: a first deposit 18 months ago, then €250 a month, one withdrawal and
// some interest (which isn't a deposit).
const FLOWS = (() => {
  const out: { reference: string; type: string; amount: number; currency: string; dateTime: string }[] = [];
  const now = new Date();
  const at = (monthsAgo: number, day: number) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, day, 9)).toISOString();
  out.push({ reference: "dep-0", type: "DEPOSIT", amount: 4000, currency: "EUR", dateTime: at(18, 3) });
  for (let m = 17; m >= 0; m--) {
    if (new Date(at(m, 5)) > now) continue;
    out.push({ reference: `dep-${18 - m}`, type: "DEPOSIT", amount: 250, currency: "EUR", dateTime: at(m, 5) });
    out.push({ reference: `int-${18 - m}`, type: "INTEREST_ON_FREE_CASH", amount: 0.42, currency: "EUR", dateTime: at(m, 28) });
  }
  out.push({ reference: "wd-1", type: "WITHDRAW", amount: -600, currency: "EUR", dateTime: at(7, 12) });
  return out.filter((f) => new Date(f.dateTime) <= now).sort((a, b) => b.dateTime.localeCompare(a.dateTime));
})();

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const round = (n: number) => Math.round(n * 100) / 100;

function positions() {
  return HOLDINGS.map((h) => {
    const price = round(h.price * (1 + (Math.random() - 0.5) * 0.01));
    const value = round(h.quantity * price);
    return {
      instrument: { ticker: h.ticker, name: h.name, isin: "XX0000000000", currency: "EUR" },
      quantity: h.quantity,
      quantityAvailableForTrading: h.quantity,
      quantityInPies: 0,
      averagePricePaid: round(h.cost / h.quantity),
      currentPrice: price,
      createdAt: "2025-03-01T10:00:00Z",
      walletImpact: {
        currency: "EUR",
        currentValue: value,
        totalCost: h.cost,
        unrealizedProfitLoss: round(value - h.cost),
        fxImpact: null,
      },
    };
  });
}

createServer((req, res) => {
  const path = new URL(req.url ?? "/", `http://localhost:${PORT}`).pathname;
  console.log(req.method, path);
  if (req.headers.authorization !== EXPECTED) return send(res, 401, { code: "BadApiKey" });
  if (req.method === "GET" && path === "/api/v0/equity/account/summary") {
    if (!SCOPES.includes("account")) return send(res, 403, { code: "Scope(account) missing" });
    const pos = positions();
    const currentValue = round(pos.reduce((s, p) => s + p.walletImpact.currentValue, 0));
    const totalCost = round(pos.reduce((s, p) => s + p.walletImpact.totalCost, 0));
    const cash = round(CASH.availableToTrade + CASH.inPies + CASH.reservedForOrders);
    return send(res, 200, {
      id: 31337,
      currency: "EUR",
      cash: CASH,
      investments: { currentValue, totalCost, unrealizedProfitLoss: round(currentValue - totalCost), realizedProfitLoss: 84.12 },
      totalValue: round(cash + currentValue),
    });
  }
  if (req.method === "GET" && path === "/api/v0/equity/positions") {
    if (!SCOPES.includes("portfolio")) return send(res, 403, { code: "Scope(portfolio) missing" });
    return send(res, 200, positions());
  }
  if (req.method === "GET" && path === "/api/v0/equity/history/transactions") {
    if (!SCOPES.includes("history")) return send(res, 403, { code: "Scope(history:transactions) missing" });
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const offset = Number(url.searchParams.get("cursor") ?? 0);
    const limit = Math.min(50, Number(url.searchParams.get("limit") ?? 20));
    const items = FLOWS.slice(offset, offset + limit);
    const next = offset + limit < FLOWS.length ? `/api/v0/equity/history/transactions?cursor=${offset + limit}&limit=${limit}` : null;
    return send(res, 200, { items, nextPagePath: next });
  }
  send(res, 404, { code: "NotFound" });
}).listen(PORT, () => console.log(`Mock Trading 212 on http://localhost:${PORT} (key: mock, secret: mock, scopes: ${SCOPES.join(",")})`));
