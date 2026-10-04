import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { dataVersion, openDb, run } from "../lib/server/db";
import { memoByVersion } from "../lib/server/snapshot";

const dir = mkdtempSync(join(tmpdir(), "subtracker-snapshot-"));
const db = await openDb(`file:${join(dir, "t.db").replaceAll("\\", "/")}`);

test("data version bumps on every write that detection depends on", async () => {
  const versions = [await dataVersion(db)];
  const bumped = async (sql: string, args: (string | number)[] = []) => {
    await run(db, sql, args);
    const v = await dataVersion(db);
    assert.notEqual(v, versions.at(-1), sql);
    versions.push(v);
  };
  await bumped(
    "INSERT INTO transactions (id, source, date, amount_minor, currency, description, merchant_key) VALUES ('a', 'csv', '2026-01-01', -100, 'EUR', 'Netflix', 'netflix')",
  );
  await bumped("UPDATE transactions SET amount_minor = -200 WHERE id = 'a'");
  await bumped("INSERT INTO overrides (key, status) VALUES ('netflix|EUR', 'ignored')");
  await bumped("UPDATE overrides SET status = 'confirmed'");
  await bumped("DELETE FROM overrides");
  await bumped("INSERT INTO tx_exclusions (tx_id) VALUES ('a')");
  await bumped("DELETE FROM tx_exclusions");
  await bumped("DELETE FROM transactions");

  // Unrelated tables don't invalidate the snapshot.
  const before = await dataVersion(db);
  await run(db, "INSERT INTO import_log (source, inserted, updated, skipped) VALUES ('csv', 0, 0, 0)");
  assert.equal(await dataVersion(db), before);
});

test("migrating twice keeps the version and triggers intact", async () => {
  const before = await dataVersion(db);
  const again = await openDb(`file:${join(dir, "t.db").replaceAll("\\", "/")}`);
  assert.equal(await dataVersion(again), before);
  await run(again, "INSERT INTO tx_exclusions (tx_id) VALUES ('b')");
  assert.notEqual(await dataVersion(again), before);
  again.close();
});

test("memoByVersion reuses the snapshot until the version changes, sharing in-flight loads", async () => {
  let version = "1";
  let loads = 0;
  const get = memoByVersion(
    async () => version,
    async (v) => {
      loads++;
      await new Promise((r) => setTimeout(r, 5));
      return `snapshot@${v}`;
    },
  );
  const [a, b] = await Promise.all([get(), get()]);
  assert.equal(a, "snapshot@1");
  assert.equal(b, "snapshot@1");
  assert.equal(await get(), "snapshot@1");
  assert.equal(loads, 1, "concurrent and repeat calls share one load");
  version = "2";
  assert.equal(await get(), "snapshot@2");
  assert.equal(loads, 2);
});

test("memoByVersion does not cache failures", async () => {
  let fail = true;
  const get = memoByVersion(
    async () => "1",
    async () => {
      if (fail) throw new Error("db down");
      return "ok";
    },
  );
  await assert.rejects(get(), /db down/);
  fail = false;
  assert.equal(await get(), "ok");
});
