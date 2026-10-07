import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Isolated data dir, a throwaway bank key and a Trading 212 key, configured before the modules load.
const dir = mkdtempSync(join(tmpdir(), "subtracker-networth-"));
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
writeFileSync(join(dir, "eb.pem"), privateKey.export({ type: "pkcs8", format: "pem" }));
Object.assign(process.env, {
  DATA_DIR: dir,
  ENABLE_BANKING_APP_ID: "test-app",
  ENABLE_BANKING_KEY_PATH: join(dir, "eb.pem"),
  ENABLE_BANKING_API_URL: "http://eb.test",
  TRADING212_API_KEY: "key",
  TRADING212_API_SECRET: "secret",
  TRADING212_API_URL: "http://t212.test",
  BASE_CURRENCY: "EUR",
});
const { pickBalance } = await import("../lib/server/enableBanking");
const { summarize } = await import("../lib/server/trading212");
const { convert, rateOn } = await import("../lib/server/fx");
const { buildNetWorth, getInvestments, getNetWorth, holdingGroup, syncTrading212 } = await import("../lib/server/netWorth");
const { all, getDb, one, run } = await import("../lib/server/db");
const { reconcileBankAccounts } = await import("../lib/server/bankAccounts");
const { syncAll } = await import("../lib/server/sync");

const DAY = 86_400_000;
const today = new Date().toISOString().slice(0, 10);

// ---------- pure logic ----------

test("the balance picked is the booked one in the account's own currency", () => {
  const b = (amount: string, currency: string, balance_type: string) => ({ balance_amount: { amount, currency }, balance_type });
  assert.deepEqual(pickBalance([b("120.00", "EUR", "ITAV"), b("100.50", "EUR", "ITBD"), b("90.00", "EUR", "CLBD")], "EUR"), {
    amountMinor: 10050,
    currency: "EUR",
    type: "ITBD",
  });
  // Available (which may include an overdraft) only when nothing booked is offered.
  assert.equal(pickBalance([b("120.00", "EUR", "ITAV"), b("1", "EUR", "SOMETHING")], "EUR")?.type, "ITAV");
  assert.equal(pickBalance([b("5.00", "USD", "ITBD"), b("7.00", "EUR", "CLAV")], "EUR")?.amountMinor, 700);
  assert.equal(pickBalance([], "EUR"), null);
  assert.equal(pickBalance([b("-12.34", "eur", "CLBD")], null)?.amountMinor, -1234);
});

test("a Trading 212 account is valued at its total, with cash, invested and positions largest first", () => {
  const s = summarize(
    {
      id: 42,
      currency: "eur",
      totalValue: 1530.25,
      cash: { availableToTrade: 20, inPies: 5, reservedForOrders: 5.25 },
      investments: { currentValue: 1500, totalCost: 1400, unrealizedProfitLoss: 100 },
    },
    [
      { quantity: 1, instrument: { ticker: "AAPL_US_EQ", name: "Apple" }, walletImpact: { currentValue: 200, unrealizedProfitLoss: -3 } },
      { quantity: 2, instrument: { ticker: "VUAA_EQ", name: "S&P 500" }, walletImpact: { currentValue: 1300, unrealizedProfitLoss: 103 } },
    ],
  );
  assert.equal(s.amountMinor, 153025);
  assert.equal(s.currency, "EUR");
  assert.equal(s.detail.cash, 30.25);
  assert.equal(s.detail.invested, 1500);
  assert.deepEqual(
    s.detail.positions?.map((p) => p.ticker),
    ["VUAA_EQ", "AAPL_US_EQ"],
  );
  assert.equal(summarize({ id: 1, currency: "GBP", totalValue: 10 }, null).detail.positions, null);
});

test("conversion uses the rate of the day, or the nearest earlier one", () => {
  const rates = new Map([
    [
      "GBP",
      [
        { date: "2026-10-01", perEur: 0.8 },
        { date: "2026-10-05", perEur: 0.9 },
      ],
    ],
  ]);
  assert.equal(rateOn(rates, "EUR", "2020-01-01"), 1);
  assert.equal(rateOn(rates, "GBP", "2026-10-03"), 0.8);
  assert.equal(rateOn(rates, "GBP", "2026-10-06"), 0.9);
  assert.equal(rateOn(rates, "GBP", "2026-09-01"), 0.8, "before the first rate: the earliest known");
  assert.equal(convert(rates, 80, "GBP", "EUR", "2026-10-02"), 100);
  assert.equal(convert(rates, 100, "EUR", "GBP", "2026-10-05"), 90);
  assert.equal(convert(rates, 1, "USD", "EUR", "2026-10-05"), null);
});

test("history carries each holding's last value forward and adds them up per kind", () => {
  const holdings = [
    {
      id: "bank:a",
      kind: "bank" as const,
      institution: "Revolut",
      name: "EUR",
      currency: "EUR",
      subtype: null,
      detail_json: null,
      last_sync_at: null,
      last_error: null,
    },
    {
      id: "t212",
      kind: "broker" as const,
      institution: "Trading 212",
      name: "Portfolio",
      currency: "GBP",
      subtype: null,
      detail_json: null,
      last_sync_at: null,
      last_error: null,
    },
    {
      id: "bank:usd",
      kind: "bank" as const,
      institution: "Revolut",
      name: "USD",
      currency: "USD",
      subtype: null,
      detail_json: null,
      last_sync_at: null,
      last_error: null,
    },
  ];
  const values = [
    { holding: "bank:a", date: "2026-10-01", amount_minor: 10000, currency: "EUR" },
    { holding: "bank:a", date: "2026-10-03", amount_minor: 15000, currency: "EUR" },
    { holding: "t212", date: "2026-10-02", amount_minor: 8000, currency: "GBP" },
    { holding: "bank:usd", date: "2026-10-02", amount_minor: 5000, currency: "USD" },
  ];
  const rates = new Map([["GBP", [{ date: "2026-10-01", perEur: 0.8 }]]]);
  const r = buildNetWorth({ holdings, values, rates, base: "EUR", today: "2026-10-04", now: Date.parse("2026-10-04T12:00:00Z") });
  assert.deepEqual(
    r.history.map((p) => [p.date, p.bank, p.broker, p.total]),
    [
      ["2026-10-01", 100, 0, 100],
      ["2026-10-02", 100, 100, 200],
      ["2026-10-03", 150, 100, 250],
      ["2026-10-04", 150, 100, 250],
    ],
  );
  assert.equal(r.total, 250);
  assert.deepEqual(r.byKind, { bank: 150, broker: 100 });
  assert.deepEqual(r.unconverted, ["USD"], "no USD rate: listed, left out of the totals");
  const usd = r.holdings.find((h) => h.id === "bank:usd");
  assert.equal(usd?.value, 50);
  assert.equal(usd?.baseValue, null);
});

// ---------- against a database, a mocked bank and a mocked Trading 212 ----------

type Reply = { status?: number; body: unknown };
let bank: (url: URL) => Reply = () => ({ body: {} });
let t212: (url: URL) => Reply = () => ({ body: {} });
const calls: URL[] = [];
globalThis.fetch = (async (input: string | URL) => {
  const url = new URL(String(input));
  calls.push(url);
  const reply =
    url.hostname === "eb.test"
      ? bank(url)
      : url.hostname === "t212.test"
        ? t212(url)
        : url.hostname === "api.frankfurter.dev"
          ? { body: { date: today, rates: { GBP: 0.85, USD: 1.1 } } }
          : { status: 404, body: {} };
  return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

const balance = (amount: string) => ({ body: { balances: [{ balance_amount: { amount, currency: "EUR" }, balance_type: "ITBD" }] } });
const noTransactions = { body: { transactions: [], continuation_key: null } };
const balanceCalls = () => calls.filter((u) => u.pathname.endsWith("/balances")).length;

async function linkBank() {
  const db = await getDb();
  await run(
    db,
    "INSERT INTO bank_sessions (session_id, aspsp_name, aspsp_country, valid_until, accounts_json, required_psu_headers, status) VALUES ('s1', 'Revolut', 'LT', ?, ?, '[]', 'active')",
    [
      new Date(Date.now() + 90 * DAY).toISOString(),
      JSON.stringify([
        { uid: "uid-main", identification_hash: "main", name: "Main", currency: "EUR" },
        { uid: "uid-savings", identification_hash: "savings", name: "Savings", currency: "EUR" },
      ]),
    ],
  );
  await reconcileBankAccounts(db);
}

test("sync records each account's balance; background runs fetch it once a day, Sync now always", async () => {
  await linkBank();
  bank = (url) => (url.pathname.endsWith("/balances") ? balance(url.pathname.includes("main") ? "1000.00" : "250.50") : noTransactions);
  calls.length = 0;
  await syncAll({ background: true });
  assert.equal(balanceCalls(), 2);
  const db = await getDb();
  const values = await all<{ holding: string; amount_minor: number }>(
    db,
    "SELECT holding, amount_minor FROM holding_values ORDER BY holding",
  );
  assert.deepEqual(
    values.map((v) => [v.holding, Number(v.amount_minor)]),
    [
      ["bank:main", 100000],
      ["bank:savings", 25050],
    ],
  );

  await run(db, "UPDATE bank_sessions SET last_sync_at = NULL"); // due again
  calls.length = 0;
  await syncAll({ background: true });
  assert.equal(balanceCalls(), 0, "already recorded today: the bank's background quota is kept for transactions");

  bank = (url) => (url.pathname.endsWith("/balances") ? balance("1200.00") : noTransactions);
  calls.length = 0;
  await syncAll({ psu: { ipAddress: "1.1.1.1" } });
  assert.equal(balanceCalls(), 2);
  const main = await one<{ amount_minor: number }>(db, "SELECT amount_minor FROM holding_values WHERE holding = 'bank:main'");
  assert.equal(Number(main?.amount_minor), 120000, "today's row is replaced, not duplicated");
});

test("a failed balance fetch is noted on the account without failing the sync", async () => {
  bank = (url) =>
    url.pathname.endsWith("/balances") ? { status: 429, body: { error: "ASPSP_RATE_LIMIT_EXCEEDED", message: "limit" } } : noTransactions;
  const r = await syncAll({ psu: { ipAddress: "1.1.1.1" } });
  assert.deepEqual(r.errors, []);
  const db = await getDb();
  const h = await one<{ last_error: string | null }>(db, "SELECT last_error FROM holdings WHERE id = 'bank:main'");
  assert.match(h?.last_error ?? "", /daily limit/);
  const session = await one<{ next_retry_at: string | null }>(db, "SELECT next_retry_at FROM bank_sessions");
  assert.equal(session?.next_retry_at, null, "transactions were fine, so no back-off");
});

// Deposit history in two pages, newest first (as the API serves it).
const flowPages: Record<string, { items: unknown[]; nextPagePath: string | null }> = {
  first: {
    items: [
      { reference: "d3", type: "DEPOSIT", amount: 200, currency: "GBP", dateTime: "2026-09-01T10:00:00Z" },
      { reference: "i1", type: "INTEREST_ON_FREE_CASH", amount: 1.2, currency: "GBP", dateTime: "2026-08-31T10:00:00Z" },
      { reference: "w1", type: "WITHDRAW", amount: -100, currency: "GBP", dateTime: "2026-08-15T10:00:00Z" },
    ],
    nextPagePath: "/api/v0/equity/history/transactions?cursor=page2",
  },
  page2: {
    items: [{ reference: "d1", type: "DEPOSIT", amount: 600, currency: "GBP", dateTime: "2026-06-01T10:00:00Z" }],
    nextPagePath: null,
  },
};

test("Trading 212 is valued from its summary and positions; a bad key keeps the last value", async () => {
  t212 = (url) =>
    url.pathname.endsWith("/equity/history/transactions")
      ? { body: flowPages[url.searchParams.get("cursor") ?? "first"] }
      : url.pathname.endsWith("/equity/account/summary")
        ? {
            body: {
              id: 7,
              currency: "GBP",
              totalValue: 850,
              cash: { availableToTrade: 50 },
              investments: { currentValue: 800, unrealizedProfitLoss: 40 },
            },
          }
        : {
            body: [
              {
                quantity: 3,
                instrument: { ticker: "VUAG_EQ", name: "Vanguard S&P 500" },
                walletImpact: { currentValue: 800, unrealizedProfitLoss: 40 },
              },
            ],
          };
  calls.length = 0;
  await syncTrading212();
  assert.deepEqual(
    calls.filter((u) => u.hostname === "t212.test").map((u) => u.pathname),
    [
      "/api/v0/equity/account/summary",
      "/api/v0/equity/positions",
      "/api/v0/equity/history/transactions",
      "/api/v0/equity/history/transactions",
    ],
  );
  const inv = await getInvestments();
  assert.equal(inv.netDeposits, 700, "600 + 200 − 100; interest isn't a deposit");
  assert.equal(inv.returnAmount, 150, "850 − 700");
  assert.ok(Math.abs((inv.returnRate ?? 0) - 150 / 700) < 1e-9);
  assert.equal(inv.deposits.complete, true);
  assert.equal(inv.history[0].date, "2026-06-01", "the deposits line starts at the first deposit");
  assert.equal(inv.history[0].value, null, "before tracking started there's no value");
  assert.equal(inv.history.at(-1)?.value, 850);
  assert.equal(inv.history.at(-1)?.deposits, 700);

  // Once complete, a run stops at the first page it already has.
  calls.length = 0;
  await syncTrading212();
  assert.equal(calls.filter((u) => u.pathname.endsWith("/history/transactions")).length, 1);

  let nw = await getNetWorth();
  const broker = nw.holdings.find((h) => h.kind === "broker");
  assert.equal(broker?.value, 850);
  assert.equal(broker?.currency, "GBP");
  assert.equal(broker?.baseValue, 1000, "850 GBP at 0.85 per EUR");
  assert.equal(broker?.broker?.positions?.[0].name, "Vanguard S&P 500");
  assert.equal(nw.byKind.bank, 2400, "both accounts at their last balance (1200 each)");
  assert.equal(nw.total, 3400);

  t212 = () => ({ status: 401, body: {} });
  await syncTrading212();
  nw = await getNetWorth();
  const after = nw.holdings.find((h) => h.kind === "broker");
  assert.equal(after?.value, 850);
  assert.match(after?.error ?? "", /rejected the API key/);
});

test("switched-off bank accounts aren't counted", async () => {
  const db = await getDb();
  let nw = await getNetWorth();
  const withSavings = nw.byKind.bank;
  await run(db, "UPDATE bank_accounts SET included = 0 WHERE account_key = 'savings'");
  nw = await getNetWorth();
  assert.ok(!nw.holdings.some((h) => h.id === "bank:savings"));
  assert.ok(nw.byKind.bank < withSavings);
  assert.equal(nw.total, nw.byKind.bank + nw.byKind.broker);
});

test("accounts are grouped by the bank's account type, else their name", () => {
  assert.equal(holdingGroup({ kind: "bank", subtype: "SVGS", name: "EUR" }), "savings");
  assert.equal(holdingGroup({ kind: "bank", subtype: "CACC", name: "Main" }), "cash");
  assert.equal(holdingGroup({ kind: "bank", subtype: null, name: "Savings vault" }), "savings");
  assert.equal(holdingGroup({ kind: "broker", subtype: null, name: "Portfolio" }), "investments");
});

test("all positions are kept, not just the largest 50", () => {
  const many = Array.from({ length: 60 }, (_, i) => ({
    quantity: 1,
    instrument: { ticker: `T${i}`, name: `Stock ${i}` },
    walletImpact: { currentValue: i + 1, totalCost: i, unrealizedProfitLoss: 1 },
  }));
  const s = summarize({ id: 1, currency: "EUR", totalValue: 2000 }, many);
  assert.equal(s.detail.positions?.length, 60);
  assert.equal(s.detail.positions?.[59].ticker, "T0", "smallest last");
});

// ---------- deposit backfill ----------

/** `n` pages, newest first; each holds one interest payment, and the oldest also the first deposit. */
function interestPages(n: number) {
  const pages: Record<string, { items: unknown[]; nextPagePath: string | null }> = {};
  for (let i = 0; i < n; i++) {
    const day = String(28 - i).padStart(2, "0");
    const items: unknown[] = [
      { reference: `int-${i}`, type: "INTEREST_ON_FREE_CASH", amount: 0.1, currency: "GBP", dateTime: `2026-05-${day}T10:00:00Z` },
    ];
    if (i === n - 1) items.push({ reference: "first", type: "DEPOSIT", amount: 500, currency: "GBP", dateTime: "2026-05-01T10:00:00Z" });
    pages[i === 0 ? "top" : `p${i}`] = { items, nextPagePath: i < n - 1 ? `/api/v0/equity/history/transactions?cursor=p${i + 1}` : null };
  }
  return pages;
}

test("a long deposit history is read over several runs, even when its newest pages hold only interest", async () => {
  const db = await getDb();
  await run(db, "DELETE FROM broker_cash_flows");
  await run(db, "DELETE FROM settings WHERE key = 'state.t212.cashFlows'");
  const pages = interestPages(12); // more than the 10 pages a run reads
  const summary = { body: { id: 7, currency: "GBP", totalValue: 850, cash: { availableToTrade: 50 }, investments: { currentValue: 800 } } };
  t212 = (url) =>
    url.pathname.endsWith("/equity/history/transactions")
      ? { body: pages[url.searchParams.get("cursor") ?? "top"] }
      : url.pathname.endsWith("/equity/account/summary")
        ? summary
        : { body: [] };
  const historyCalls = () => calls.filter((u) => u.pathname.endsWith("/history/transactions")).map((u) => u.searchParams.get("cursor"));

  calls.length = 0;
  await syncTrading212();
  assert.equal(historyCalls().length, 10, "the first run stops at its page budget");
  let inv = await getInvestments();
  assert.equal(inv.deposits.complete, false);
  assert.equal(inv.netDeposits, null, "a partial history isn't shown as all-time net deposits");
  assert.equal(inv.returnAmount, null, "nor turned into a return");

  calls.length = 0;
  await syncTrading212();
  // Catch up from the top (already seen after one page), then resume where the backfill stopped.
  assert.deepEqual(historyCalls(), [null, "p10", "p11"]);
  inv = await getInvestments();
  assert.equal(inv.deposits.complete, true);
  assert.equal(inv.netDeposits, 500);
  assert.equal(inv.returnAmount, 350);

  calls.length = 0;
  await syncTrading212();
  assert.deepEqual(historyCalls(), [null], "once complete, one page is enough to see nothing's new");
});

test("withdrawing more than was paid in gives no rate of return", async () => {
  const db = await getDb();
  await run(db, "DELETE FROM broker_cash_flows");
  await run(
    db,
    "INSERT INTO broker_cash_flows (holding, reference, date, type, amount_minor, currency) VALUES ('t212', 'w', '2026-06-01', 'WITHDRAW', -100000, 'GBP')",
  );
  const inv = await getInvestments();
  assert.equal(inv.netDeposits, -1000);
  assert.equal(inv.returnRate, null);
});
