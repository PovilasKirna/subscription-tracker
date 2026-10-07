import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isColorChoice } from "../lib/color";
import { colorColumns, dataVersion, dataVersions, NO_COLOR_SLOT, type Override, one, openDb, run, saveOverride } from "../lib/server/db";
import { memoLatest } from "../lib/server/snapshot";

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

test("category picks bump their own version, not the data version", async () => {
  const before = await dataVersions(db);
  await run(db, "INSERT INTO category_rules (merchant_key, category) VALUES ('lidl', 'groceries')");
  await run(db, "INSERT INTO tx_categories (tx_id, category) VALUES ('a', 'shopping')");
  await run(db, "UPDATE tx_categories SET category = 'travel'");
  await run(db, "DELETE FROM category_rules");
  const after = await dataVersions(db);
  assert.equal(after.data, before.data, "detection is reused");
  assert.equal(after.categories, before.categories + 4);
  assert.equal(await dataVersion(db), after.data);
});

test("migrating drops the old triggers that bumped the data version on category picks", async () => {
  await run(
    db,
    "CREATE TRIGGER tx_categories_insert_version AFTER INSERT ON tx_categories BEGIN UPDATE meta SET value = value + 1 WHERE key = 'data_version'; END",
  );
  const again = await openDb(`file:${join(dir, "t.db").replaceAll("\\", "/")}`);
  const before = await dataVersions(again);
  await run(again, "INSERT INTO tx_categories (tx_id, category) VALUES ('c', 'travel')");
  assert.deepEqual(await dataVersions(again), { data: before.data, categories: before.categories + 1 });
  again.close();
});

test("memoLatest reuses the value until the version changes, sharing in-flight loads", async () => {
  let loads = 0;
  const get = memoLatest(async (v: string, suffix: string) => {
    loads++;
    await new Promise((r) => setTimeout(r, 5));
    return `snapshot@${v}${suffix}`;
  });
  const [a, b] = await Promise.all([get("1", "!"), get("1", "!")]);
  assert.equal(a, "snapshot@1!");
  assert.equal(b, "snapshot@1!");
  assert.equal(await get("1", "!"), "snapshot@1!");
  assert.equal(loads, 1, "concurrent and repeat calls share one load");
  assert.equal(await get("2", "!"), "snapshot@2!");
  assert.equal(loads, 2);
});

test("memoLatest does not cache failures", async () => {
  let fail = true;
  const get = memoLatest(async () => {
    if (fail) throw new Error("db down");
    return "ok";
  });
  await assert.rejects(get("1"), /db down/);
  fail = false;
  assert.equal(await get("1"), "ok");
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
