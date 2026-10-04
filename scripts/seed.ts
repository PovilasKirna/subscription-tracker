// Import a Revolut CSV straight into the database (no UI needed):
//   npm run seed -- path/to/statement.csv     (defaults to samples/revolut-sample.csv)
// Uses DATABASE_URL / TURSO_DATABASE_URL when set, otherwise the local data/tracker.db.
import { readFileSync } from "node:fs";
import { config } from "../src/lib/server/config";
import { insertTransactions, logImport, openDb } from "../src/lib/server/db";
import { parseRevolutCsv } from "../src/lib/server/revolutCsv";

const file = process.argv[2] ?? "samples/revolut-sample.csv";
const db = await openDb();
const { rows, skipped } = parseRevolutCsv(readFileSync(file, "utf8"));
const stats = await insertTransactions(db, rows);
stats.skipped += skipped;
await logImport(db, "csv", stats, file);
console.log(`Imported ${file} into ${config.databaseUrl.replace(/\?.*$/, "")}:`, stats);
db.close();
