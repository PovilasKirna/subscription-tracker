import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { BankAccountRow } from "../lib/server/bankAccounts";

// Isolated data dir + a throwaway key, configured before the modules load (as in bank.test.ts).
const dir = mkdtempSync(join(tmpdir(), "subtracker-accounts-"));
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
writeFileSync(join(dir, "eb.pem"), privateKey.export({ type: "pkcs8", format: "pem" }));
Object.assign(process.env, {
  DATA_DIR: dir,
  ENABLE_BANKING_APP_ID: "test-app",
  ENABLE_BANKING_KEY_PATH: join(dir, "eb.pem"),
  ENABLE_BANKING_API_URL: "http://eb.test",
});
const { fetchWindow, planAccountRows, reconcileBankAccounts, visibleTransactions, withoutHiddenAccounts } = await import(
  "../lib/server/bankAccounts"
);
const { all, dataVersion, getDb, insertTransactions, one, run } = await import("../lib/server/db");
const { syncAll } = await import("../lib/server/sync");
const { historyGap } = await import("../lib/bank");

const DAY = 86_400_000;

// ---------- pure logic ----------

test("a session that never synced fetches the full history, whatever the accounts say", () => {
  assert.deepEqual(fetchWindow({ syncedThrough: null }, { lastSyncAt: null }), { kind: "full" });
  assert.deepEqual(fetchWindow({ syncedThrough: "2026-09-01T10:00:00.000Z" }, { lastSyncAt: null }), { kind: "full" });
});

test("each account continues from its own last fetch, overlapping a week", () => {
  // An account switched off in June and back on now backfills from June, not from the session's last sync.
  assert.deepEqual(fetchWindow({ syncedThrough: "2026-06-10T08:00:00.000Z" }, { lastSyncAt: "2026-10-04T08:00:00.000Z" }), {
    kind: "incremental",
    dateFrom: "2026-06-03",
  });
});

test("accounts without their own progress fall back to the session's last sync", () => {
  assert.deepEqual(fetchWindow({ syncedThrough: null }, { lastSyncAt: "2026-10-04T08:00:00.000Z" }), {
    kind: "incremental",
    dateFrom: "2026-09-27",
  });
});

const session = (id: string, keys: string[]) => ({
  session_id: id,
  accounts_json: JSON.stringify(keys.map((k) => ({ uid: `uid-${id}-${k}`, identification_hash: k, name: `Acc ${k}`, currency: "EUR" }))),
});
const row = (key: string, sessionId: string, extra: Partial<BankAccountRow> = {}): BankAccountRow => ({
  account_key: key,
  session_id: sessionId,
  name: `Acc ${key}`,
  iban: null,
  currency: "EUR",
  included: 1,
  synced_through: null,
  ...extra,
});

test("account rows follow the sessions: added, moved to the newest session, removed when no session lists them", () => {
  const empty = planAccountRows([session("s1", ["a", "b"])], []);
  assert.deepEqual(
    empty.upsert.map((u) => [u.account_key, u.session_id]),
    [
      ["a", "s1"],
      ["b", "s1"],
    ],
  );
  assert.deepEqual(empty.remove, []);

  // Already in line: nothing to write (the common case on every status poll).
  const same = planAccountRows([session("s1", ["a", "b"])], [row("a", "s1"), row("b", "s1")]);
  assert.deepEqual(same, { upsert: [], remove: [] });

  // A reconnect (newest session first) takes over "a"; "b" is gone from the bank; "c" is new.
  const moved = planAccountRows([session("s2", ["a", "c"]), session("s1", ["a"])], [row("a", "s1", { included: 0 }), row("b", "s1")]);
  assert.deepEqual(
    moved.upsert.map((u) => [u.account_key, u.session_id]),
    [
      ["a", "s2"],
      ["c", "s2"],
    ],
  );
  assert.deepEqual(moved.remove, ["b"]);

  // Disconnecting the only session removes its rows, so hidden transactions show again.
  assert.deepEqual(planAccountRows([], [row("a", "s1", { included: 0 })]).remove, ["a"]);
});

test("only bank transactions of switched-off accounts are hidden", () => {
  const txs = [
    { id: "1", source: "bank" as const, account: "off" },
    { id: "2", source: "bank" as const, account: "on" },
    { id: "3", source: "csv" as const, account: "off" }, // CSV rows aren't linked to bank accounts
    { id: "4", source: "bank" as const, account: null },
  ];
  assert.deepEqual(
    withoutHiddenAccounts(txs, new Set(["off"])).map((t) => t.id),
    ["2", "3", "4"],
  );
  assert.equal(withoutHiddenAccounts(txs, new Set()), txs, "no copy when nothing is hidden");
});

test("the gap warning appears only after about 90 days", () => {
  const now = Date.parse("2026-10-04T12:00:00Z");
  assert.equal(historyGap(null, now), false);
  assert.equal(historyGap(new Date(now - 30 * DAY).toISOString(), now), false);
  assert.equal(historyGap(new Date(now - 120 * DAY).toISOString(), now), true);
});

// ---------- against a database and a mocked bank ----------

type Call = { url: URL };
const calls: Call[] = [];
globalThis.fetch = (async (input: string | URL) => {
  const url = new URL(String(input));
  calls.push({ url });
  const uid = decodeURIComponent(url.pathname.split("/")[2] ?? "");
  const body = {
    transactions: [
      {
        entry_reference: `ref-${uid}`,
        transaction_amount: { amount: "9.99", currency: "EUR" },
        credit_debit_indicator: "DBIT",
        status: "BOOK",
        booking_date: "2026-09-02",
        creditor: { name: `Shop ${uid}` },
        bank_transaction_code: { code: "CCRD", sub_code: "POSD", description: "Card payment" },
      },
    ],
    continuation_key: null,
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

async function link(id: string, keys: string[], lastSyncAt: string | null = null) {
  const db = await getDb();
  await run(db, "DELETE FROM bank_sessions");
  await run(
    db,
    "INSERT INTO bank_sessions (session_id, aspsp_name, aspsp_country, valid_until, accounts_json, required_psu_headers, status, last_sync_at) VALUES (?, 'Revolut', 'LT', ?, ?, '[]', 'active', ?)",
    [id, new Date(Date.now() + 90 * DAY).toISOString(), session(id, keys).accounts_json, lastSyncAt],
  );
  return reconcileBankAccounts(db);
}
const accountRow = async (key: string) => one<BankAccountRow>(await getDb(), "SELECT * FROM bank_accounts WHERE account_key = ?", [key]);
const fetchedUids = () => calls.map((c) => decodeURIComponent(c.url.pathname.split("/")[2] ?? "")).sort();

test("switching an account off skips it during sync; the others record their progress", async () => {
  await link("s1", ["main", "savings"]);
  const db = await getDb();
  await run(db, "UPDATE bank_accounts SET included = 0 WHERE account_key = 'savings'");
  calls.length = 0;
  await syncAll({ psu: { ipAddress: "1.1.1.1" } });
  assert.deepEqual(fetchedUids(), ["uid-s1-main"]);
  assert.ok((await accountRow("main"))?.synced_through);
  assert.equal((await accountRow("savings"))?.synced_through, null);
});

test("a switched-back-on account continues from its own last fetch", async () => {
  const db = await getDb();
  const longAgo = new Date(Date.now() - 40 * DAY).toISOString();
  await run(db, "UPDATE bank_accounts SET included = 1, synced_through = ? WHERE account_key = 'savings'", [longAgo]);
  calls.length = 0;
  await syncAll({ psu: { ipAddress: "1.1.1.1" } });
  const savings = calls.find((c) => c.url.pathname.includes("savings"));
  assert.equal(savings?.url.searchParams.get("date_from"), new Date(Date.parse(longAgo) - 7 * DAY).toISOString().slice(0, 10));
  assert.equal(savings?.url.searchParams.get("strategy"), null);
  const main = calls.find((c) => c.url.pathname.includes("main"));
  assert.ok((main?.url.searchParams.get("date_from") ?? "") > (savings?.url.searchParams.get("date_from") ?? ""));
});

test("only the Included switch invalidates the detection snapshot, not sync progress", async () => {
  const db = await getDb();
  const v0 = await dataVersion(db);
  await run(db, "UPDATE bank_accounts SET synced_through = ? WHERE account_key = 'main'", [new Date().toISOString()]);
  assert.equal(await dataVersion(db), v0, "progress alone");
  await run(db, "UPDATE bank_accounts SET included = 1 WHERE account_key = 'main'");
  assert.equal(await dataVersion(db), v0, "no actual change");
  await run(db, "UPDATE bank_accounts SET included = 0 WHERE account_key = 'main'");
  const v1 = await dataVersion(db);
  assert.notEqual(v1, v0);
  await run(db, "UPDATE bank_accounts SET included = 1 WHERE account_key = 'main'");
  assert.notEqual(await dataVersion(db), v1);
});

test("hidden accounts' transactions are left out of every view but stay stored", async () => {
  const db = await getDb();
  await insertTransactions(db, [
    {
      id: "csv:x",
      source: "csv",
      account: "Current",
      date: "2026-08-01",
      amount_minor: -500,
      currency: "EUR",
      description: "Bakery",
      merchant_key: "bakery",
      type: "CARD_PAYMENT",
      state: "COMPLETED",
    },
  ]);
  await run(db, "UPDATE bank_accounts SET included = 0 WHERE account_key = 'savings'");
  const visible = await visibleTransactions(db);
  assert.ok(visible.every((t) => t.account !== "savings"));
  assert.ok(visible.some((t) => t.account === "main"));
  assert.ok(visible.some((t) => t.id === "csv:x"));
  const stored = await all<{ id: string }>(db, "SELECT id FROM transactions WHERE account = 'savings'");
  assert.ok(stored.length > 0, "nothing is deleted");
});

test("a reconnect keeps the switch; disconnecting shows hidden transactions again", async () => {
  // Reconnect: a new session lists the same stable account keys.
  const rows = await link("s2", ["main", "savings"], null);
  assert.deepEqual(rows.map((r) => [r.account_key, r.session_id, r.included]).sort(), [
    ["main", "s2", 1],
    ["savings", "s2", 0],
  ]);
  const db = await getDb();
  const before = await dataVersion(db);
  await run(db, "DELETE FROM bank_sessions WHERE session_id = 's2'");
  assert.deepEqual(await reconcileBankAccounts(db), []);
  assert.notEqual(await dataVersion(db), before, "hidden rows coming back invalidates the snapshot");
  assert.ok((await visibleTransactions(db)).some((t) => t.account === "savings"));
});
