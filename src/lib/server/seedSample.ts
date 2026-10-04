import { type Db, insertTransactions, logImport, one } from "./db";
import { parseRevolutCsv } from "./revolutCsv";
import { sampleRevolutCsv } from "./sampleData";

// Dev/preview databases fill themselves with the fake sample statement, so every fresh
// environment is ready to click through without importing anything.

/** Opt-in via SEED_SAMPLE_DATA=true, and never on a Vercel production deployment. */
export function sampleSeedingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SEED_SAMPLE_DATA === "true" && env.VERCEL_ENV !== "production";
}

/** Imports the sample statement only into a database without any transactions. */
export async function seedSampleIfEmpty(db: Db, today = new Date()): Promise<boolean> {
  const existing = await one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM transactions");
  if (Number(existing?.n ?? 0) > 0) return false;
  const { rows, skipped } = parseRevolutCsv(sampleRevolutCsv(today));
  const stats = await insertTransactions(db, rows);
  stats.skipped += skipped;
  await logImport(db, "sample", stats, "Sample data (SEED_SAMPLE_DATA)");
  return true;
}
