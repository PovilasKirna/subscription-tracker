import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { insertTransactions, one, openDb } from "../lib/server/db";
import { parseRevolutCsv } from "../lib/server/revolutCsv";
import { sampleRevolutCsv } from "../lib/server/sampleData";
import { sampleSeedingEnabled, seedSampleIfEmpty } from "../lib/server/seedSample";

const dir = mkdtempSync(join(tmpdir(), "subtracker-seed-"));
const fileUrl = (name: string) => `file:${join(dir, name).replaceAll("\\", "/")}`;
const count = async (db: Awaited<ReturnType<typeof openDb>>) =>
  Number((await one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM transactions"))?.n);

test("sample statement is deterministic, parseable and ends today", () => {
  const today = new Date("2026-10-04T12:00:00Z");
  const csv = sampleRevolutCsv(today);
  assert.equal(csv, sampleRevolutCsv(today));
  const { rows, skipped } = parseRevolutCsv(csv);
  assert.ok(rows.length > 500);
  assert.equal(skipped, 1, "the declined Netflix charge is skipped");
  assert.ok(rows.every((r) => r.date <= "2026-10-04"));
  assert.ok(rows.some((r) => r.merchant_key.includes("netflix")));
});

test("sample seeding is opt-in and never runs in Vercel production", () => {
  assert.equal(sampleSeedingEnabled({}), false);
  assert.equal(sampleSeedingEnabled({ SEED_SAMPLE_DATA: "true" }), true);
  assert.equal(sampleSeedingEnabled({ SEED_SAMPLE_DATA: "true", VERCEL_ENV: "preview" }), true);
  assert.equal(sampleSeedingEnabled({ SEED_SAMPLE_DATA: "true", VERCEL_ENV: "production" }), false);
  assert.equal(sampleSeedingEnabled({ SEED_SAMPLE_DATA: "1" }), false);
});

test("seeds an empty database once and leaves one with data alone", async () => {
  const empty = await openDb(fileUrl("empty.db"));
  assert.equal(await seedSampleIfEmpty(empty), true);
  const seeded = await count(empty);
  assert.ok(seeded > 500);
  assert.equal(await seedSampleIfEmpty(empty), false, "second call is a no-op");
  assert.equal(await count(empty), seeded);
  empty.close();

  const real = await openDb(fileUrl("real.db"));
  const { rows } = parseRevolutCsv(
    "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\nCARD_PAYMENT,Current,2026-01-01 10:00:00,2026-01-01 10:00:00,Coffee,-3.00,0.00,EUR,COMPLETED,10.00\n",
  );
  await insertTransactions(real, rows);
  assert.equal(await seedSampleIfEmpty(real), false);
  assert.equal(await count(real), 1);
  real.close();
});
