import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isColorChoice } from "../lib/color";
import { colorColumns, dataVersion, NO_COLOR_SLOT, type Override, one, openDb, run, saveOverride } from "../lib/server/db";
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

test("saveOverride changes only the fields it is given", async () => {
  const key = "spotify|EUR";
  const row = () =>
    one<Override>(db, "SELECT key, display_name, category, status, color_slot, cadence FROM overrides WHERE key = ?", [key]);
  await saveOverride(db, key, { color_slot: 5 });
  await saveOverride(db, key, { display_name: "Spotify Family" }); // a rename must not undo the colour
  assert.deepEqual(
    { ...(await row()) },
    { key, display_name: "Spotify Family", category: null, status: null, color_slot: 5, cadence: null },
  );
  await saveOverride(db, key, { color_slot: null }); // explicit null resets just that field
  assert.deepEqual(
    { ...(await row()) },
    { key, display_name: "Spotify Family", category: null, status: null, color_slot: null, cadence: null },
  );
});

test("a colour choice maps to exactly one of the colour columns", async () => {
  const key = "netflix|EUR";
  const colour = () => one<Override>(db, "SELECT color_slot, color_hex FROM overrides WHERE key = ?", [key]);
  await saveOverride(db, key, colorColumns(3));
  assert.deepEqual({ ...(await colour()) }, { color_slot: 3, color_hex: null });
  await saveOverride(db, key, colorColumns("#ABCDEF"));
  assert.deepEqual({ ...(await colour()) }, { color_slot: null, color_hex: "#abcdef" });
  await saveOverride(db, key, colorColumns("none"));
  assert.deepEqual({ ...(await colour()) }, { color_slot: NO_COLOR_SLOT, color_hex: null });
  await saveOverride(db, key, colorColumns(null));
  assert.deepEqual({ ...(await colour()) }, { color_slot: null, color_hex: null });
});

test("colour choices are validated", () => {
  for (const ok of [1, 8, "none", "#a1b2c3", "#ABCDEF"]) assert.ok(isColorChoice(ok), String(ok));
  for (const bad of [0, 9, 1.5, "#abc", "#abcdeg", "red", "", null, {}]) assert.ok(!isColorChoice(bad), String(bad));
});
