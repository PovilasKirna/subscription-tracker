import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Isolated data dir + a throwaway RSA key, configured before the modules load.
const dir = mkdtempSync(join(tmpdir(), "subtracker-"));
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
writeFileSync(join(dir, "eb.pem"), privateKey.export({ type: "pkcs8", format: "pem" }));
Object.assign(process.env, {
  DATA_DIR: dir,
  ENABLE_BANKING_APP_ID: "test-app",
  ENABLE_BANKING_KEY_PATH: join(dir, "eb.pem"),
  ENABLE_BANKING_API_URL: "http://eb.test",
});
const eb = await import("../lib/server/enableBanking");
const { all, getDb, insertTransactions, one, run, sameMerchant } = await import("../lib/server/db");
const { isSyncing, syncAll } = await import("../lib/server/sync");
const { merchantKey } = await import("../lib/server/merchant");

type Call = { url: URL; headers: Record<string, string> };
const calls: Call[] = [];
let respond: (url: URL) => { status?: number; body: unknown } = () => ({ body: {} });
/** Runs before each mocked response, e.g. to inspect the DB mid-sync. */
let onFetch: ((url: URL) => Promise<void>) | null = null;
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  await onFetch?.(url);
  calls.push({
    url,
    headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])),
  });
  const { status = 200, body } = respond(url);
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

const tx = (
  ref: string,
  date: string,
  amount: string,
  name: string,
  extra: Partial<import("../lib/server/enableBanking").EbTransaction> = {},
) => ({
  entry_reference: ref,
  transaction_amount: { amount, currency: "EUR" },
  credit_debit_indicator: "DBIT" as const,
  status: "BOOK",
  booking_date: date,
  creditor: { name },
  bank_transaction_code: { code: "CCRD", sub_code: "POSD", description: "Card payment" },
  ...extra,
});

test("JWT is RS256-signed with the app id as kid", () => {
  const [h, p, sig] = eb.makeJwt().split(".");
  const head = JSON.parse(Buffer.from(h, "base64url").toString());
  const body = JSON.parse(Buffer.from(p, "base64url").toString());
  assert.deepEqual(head, { typ: "JWT", alg: "RS256", kid: "test-app" });
  assert.equal(body.aud, "api.enablebanking.com");
  assert.equal(body.exp - body.iat, 3600);
  assert.ok(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, sig, "base64url"));
});

test("PSU headers are all-or-nothing against the bank's required set", () => {
  const psu = { ipAddress: "1.2.3.4", userAgent: "UA" };
  assert.deepEqual(eb.psuHeaders(psu), { "Psu-Ip-Address": "1.2.3.4", "Psu-User-Agent": "UA" });
  assert.deepEqual(eb.psuHeaders(psu, ["psu-ip-address"]), { "Psu-Ip-Address": "1.2.3.4", "Psu-User-Agent": "UA" });
  assert.deepEqual(eb.psuHeaders(psu, ["Psu-Geo-Location"]), {});
  assert.deepEqual(eb.psuHeaders(undefined), {});
});

test("maps bank transactions: sign, type from ISO codes, pending skipped", () => {
  const card = eb.mapTransaction("acc", tx("r1", "2026-01-05", "15.99", "NETFLIX.COM"));
  assert.equal(card?.amount_minor, -1599);
  assert.equal(card?.type, "CARD_PAYMENT");
  assert.equal(card?.merchant_key, "netflix");
  assert.equal(card?.id, "bank:acc:r1");

  const transfer = eb.mapTransaction(
    "acc",
    tx("r2", "2026-01-03", "650.00", "Landlord", { bank_transaction_code: { code: "ICDT", sub_code: "ESCT" } }),
  );
  assert.equal(transfer?.type, "TRANSFER");

  const salary = eb.mapTransaction("acc", {
    ...tx("r3", "2026-01-02", "2400.00", ""),
    credit_debit_indicator: "CRDT",
    creditor: null,
    debtor: { name: "Employer UAB" },
    bank_transaction_code: { code: "RCDT" },
  });
  assert.equal(salary?.amount_minor, 240000);
  assert.equal(salary?.type, "TOPUP");
  assert.equal(salary?.description, "Employer UAB");

  assert.equal(eb.mapTransaction("acc", tx("r4", "2026-01-06", "4.20", "Cafe", { status: "PDNG" })), null);
  const noName = eb.mapTransaction(
    "acc",
    tx("r5", "2026-01-07", "9.99", "", { creditor: null, remittance_information: ["Spotify P1234"] }),
  );
  assert.equal(noName?.merchant_key, "spotify");
});

test("fetchTransactions follows continuation keys and sends strategy + PSU headers", async () => {
  calls.length = 0;
  respond = (url) =>
    url.searchParams.get("continuation_key")
      ? { body: { transactions: [tx("b", "2026-02-01", "2.00", "B")], continuation_key: null } }
      : { body: { transactions: [tx("a", "2026-01-01", "1.00", "A")], continuation_key: "page2" } };
  const rows = await eb.fetchTransactions(
    { uid: "uid-1", identification_hash: "stable-hash" },
    { dateFrom: "2021-01-01", strategy: "longest", psu: { ipAddress: "9.9.9.9" } },
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    ["bank:stable-hash:a", "bank:stable-hash:b"],
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.pathname, "/accounts/uid-1/transactions");
  assert.equal(calls[0].url.searchParams.get("strategy"), "longest");
  assert.equal(calls[1].url.searchParams.get("continuation_key"), "page2");
  assert.equal(calls[0].headers["psu-ip-address"], "9.9.9.9");
  assert.match(calls[0].headers.authorization, /^Bearer /);
});

test("cross-source de-duplication matches bank names to CSV names, one-to-one", async () => {
  assert.ok(sameMerchant(merchantKey("UAB LEMON GYM"), merchantKey("Lemon Gym")));
  assert.ok(sameMerchant(merchantKey("TELIA LIETUVA, AB"), merchantKey("Telia Lietuva")));
  assert.ok(!sameMerchant(merchantKey("Maxima LT"), merchantKey("Lidl Vilnius")));

  const db = await getDb();
  const csv = (id: string, date: string) => ({
    id,
    source: "csv" as const,
    account: "Current",
    date,
    amount_minor: -3499,
    currency: "EUR",
    description: "Lemon Gym",
    merchant_key: merchantKey("Lemon Gym"),
    type: "CARD_PAYMENT",
    state: "COMPLETED",
  });
  await insertTransactions(db, [csv("csv:g1", "2026-03-01")]);
  const bank = (ref: string) => eb.mapTransaction("acc", tx(ref, "2026-03-02", "34.99", "UAB LEMON GYM"));
  const stats = await insertTransactions(
    db,
    [bank("x1"), bank("x2")].filter((r) => r !== null),
  );
  assert.deepEqual(stats, { inserted: 1, updated: 0, skipped: 1 }); // second identical charge is real
});

async function addSession(id: string, extra: Record<string, string | null> = {}) {
  const db = await getDb();
  await run(db, "DELETE FROM bank_sessions");
  await run(
    db,
    "INSERT INTO bank_sessions (session_id, aspsp_name, aspsp_country, valid_until, accounts_json, required_psu_headers, status, last_sync_at, next_retry_at) VALUES (?, 'Revolut', 'LT', ?, ?, '[]', 'active', ?, ?)",
    [
      id,
      new Date(Date.now() + 90 * 86_400_000).toISOString(),
      JSON.stringify([{ uid: "uid-9", identification_hash: "rev-eur" }]),
      extra.last_sync_at ?? null,
      extra.next_retry_at ?? null,
    ],
  );
}
const session = async (id: string) =>
  (await one<Record<string, string | null>>(await getDb(), "SELECT * FROM bank_sessions WHERE session_id = ?", [id])) ?? {};

test("first sync asks for the longest history; the next one is incremental", async () => {
  await addSession("s1");
  calls.length = 0;
  respond = () => ({ body: { transactions: [tx("n1", "2026-04-02", "12.99", "DUOLINGO")], continuation_key: null } });
  const first = await syncAll({ psu: { ipAddress: "1.1.1.1" } });
  assert.equal(first.inserted, 1);
  assert.equal(calls[0].url.searchParams.get("strategy"), "longest");
  assert.ok((await session("s1")).last_sync_at);

  calls.length = 0;
  const second = await syncAll();
  assert.equal(second.inserted, 0);
  assert.equal(calls[0].url.searchParams.get("strategy"), null);
  assert.equal(calls[0].headers["psu-ip-address"], undefined); // background: no PSU headers
});

test("a bank rate limit backs off background syncs but not user-triggered ones", async () => {
  await addSession("s2", { last_sync_at: new Date(Date.now() - 13 * 3_600_000).toISOString() });
  respond = () => ({ status: 429, body: { error: "ASPSP_RATE_LIMIT_EXCEEDED", message: "limit" } });
  const r = await syncAll({ background: true });
  assert.equal(r.errors.length, 1);
  assert.ok((await session("s2")).next_retry_at);

  calls.length = 0;
  await syncAll({ background: true });
  assert.equal(calls.length, 0, "background run waits for the back-off");

  respond = () => ({ body: { transactions: [], continuation_key: null } });
  await syncAll({ psu: { ipAddress: "1.1.1.1" } });
  assert.equal(calls.length, 1, "Sync now still goes through");
  assert.equal((await session("s2")).next_retry_at, null);
});

test("background runs skip sessions that synced recently", async () => {
  await addSession("s3", { last_sync_at: new Date(Date.now() - 2 * 3_600_000).toISOString() });
  calls.length = 0;
  await syncAll({ background: true, minIntervalHours: 12 });
  assert.equal(calls.length, 0);
});

test("a run reads as syncing until its import is logged, with no gap between sessions", async () => {
  await addSession("s5");
  const db = await getDb();
  await run(
    db,
    "INSERT INTO bank_sessions (session_id, aspsp_name, aspsp_country, accounts_json, status) VALUES ('s6', 'Other', 'LT', ?, 'active')",
    [JSON.stringify([{ uid: "uid-8", identification_hash: "other-eur" }])],
  );
  const logged = async () => Number((await one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM import_log WHERE source = 'bank'"))?.n);
  const before = await logged();
  const markers: string[][] = [];
  onFetch = async () => {
    const rows = await all<{ session_id: string }>(
      db,
      "SELECT session_id FROM bank_sessions WHERE sync_started_at IS NOT NULL ORDER BY session_id",
    );
    markers.push(rows.map((r) => r.session_id));
  };
  respond = () => ({ body: { transactions: [], continuation_key: null } });
  try {
    await syncAll({ psu: { ipAddress: "1.1.1.1" } });
  } finally {
    onFetch = null;
  }
  // While the second session fetches, the first still counts as syncing (no "finished" gap).
  assert.deepEqual(markers.at(-1), ["s5", "s6"]);
  assert.equal(await isSyncing(), false);
  assert.equal(await logged(), before + 1, "one import entry for the whole run");
});

test("revoked consent flags the session for reconnect", async () => {
  await addSession("s4");
  respond = () => ({ status: 401, body: { error: "EXPIRED_SESSION", message: "expired" } });
  await syncAll();
  assert.equal((await session("s4")).status, "needs_reconnect");
  calls.length = 0;
  await syncAll();
  assert.equal(calls.length, 0, "no further calls until reconnected");
});
