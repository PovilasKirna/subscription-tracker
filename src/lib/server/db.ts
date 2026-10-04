import { type Client, createClient, type InStatement, type InValue } from "@libsql/client";
import { config } from "./config";

// libSQL (open-source SQLite fork): a local file for dev/Docker (`file:./data/tracker.db`),
// or a hosted Turso database on serverless platforms like Vercel. Same SQL either way.

export type Db = Client;

export type TxRow = {
  id: string;
  source: "csv" | "bank";
  account: string | null;
  date: string; // YYYY-MM-DD
  amount_minor: number; // signed, negative = money out
  currency: string;
  description: string;
  merchant_key: string;
  type: string | null;
  state: string | null;
};

export type OverrideStatus = "confirmed" | "ignored" | "cancelled";
export type Override = {
  key: string;
  display_name: string | null;
  category: string | null;
  status: OverrideStatus | null;
  /** Preset colour slot (1–8) the user picked; null = automatic. */
  color_slot: number | null;
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS transactions (
    id            TEXT PRIMARY KEY,
    source        TEXT NOT NULL,
    account       TEXT,
    date          TEXT NOT NULL,
    amount_minor  INTEGER NOT NULL,
    currency      TEXT NOT NULL,
    description   TEXT NOT NULL,
    merchant_key  TEXT NOT NULL,
    type          TEXT,
    state         TEXT,
    imported_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS tx_merchant ON transactions(merchant_key, currency);
  CREATE INDEX IF NOT EXISTS tx_date ON transactions(date);

  -- User decisions about a detected subscription (or a merchant to force-track).
  CREATE TABLE IF NOT EXISTS overrides (
    key           TEXT PRIMARY KEY,
    display_name  TEXT,
    category      TEXT,
    status        TEXT
  );

  CREATE TABLE IF NOT EXISTS bank_sessions (
    session_id    TEXT PRIMARY KEY,
    aspsp_name    TEXT NOT NULL,
    aspsp_country TEXT NOT NULL,
    valid_until   TEXT,
    accounts_json TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_sync_at  TEXT,
    last_error    TEXT
  );

  CREATE TABLE IF NOT EXISTS pending_auth (
    state         TEXT PRIMARY KEY,
    aspsp_name    TEXT NOT NULL,
    aspsp_country TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Charges the user removed from a subscription (e.g. a one-off transfer to the same card).
  CREATE TABLE IF NOT EXISTS tx_exclusions (
    tx_id       TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS import_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    at        TEXT NOT NULL DEFAULT (datetime('now')),
    source    TEXT NOT NULL,
    inserted  INTEGER NOT NULL,
    updated   INTEGER NOT NULL,
    skipped   INTEGER NOT NULL,
    message   TEXT
  );

  -- Bumped by triggers on every write that detection depends on, so a cached detection
  -- snapshot can be reused until the data changes (works across server instances).
  CREATE TABLE IF NOT EXISTS meta (
    key    TEXT PRIMARY KEY,
    value  INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO meta (key, value) VALUES ('data_version', 0);
${["transactions", "overrides", "tx_exclusions"]
  .flatMap((table) =>
    ["INSERT", "UPDATE", "DELETE"].map(
      (op) => `
  CREATE TRIGGER IF NOT EXISTS ${table}_${op.toLowerCase()}_version AFTER ${op} ON ${table}
  BEGIN UPDATE meta SET value = value + 1 WHERE key = 'data_version'; END;`,
    ),
  )
  .join("")}
`;

// Additive migrations for databases created by earlier versions.
const COLUMNS: Record<string, Record<string, string>> = {
  bank_sessions: {
    required_psu_headers: "TEXT", // JSON array from the bank's ASPSP config
    status: "TEXT", // active | needs_reconnect
    next_retry_at: "TEXT", // set after a bank rate limit; background sync waits until then
    sync_started_at: "TEXT", // set while a sync runs (visible across server instances)
  },
  pending_auth: { required_psu_headers: "TEXT" },
  overrides: { color_slot: "INTEGER" }, // user-picked preset colour; null = automatic
};

async function migrate(db: Client) {
  await db.executeMultiple(SCHEMA);
  for (const [table, cols] of Object.entries(COLUMNS)) {
    const info = await db.execute(`PRAGMA table_info(${table})`);
    const existing = new Set(info.rows.map((c) => String(c.name)));
    for (const [col, type] of Object.entries(cols)) {
      if (!existing.has(col)) await db.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    }
  }
}

export async function openDb(url = config.databaseUrl, authToken = config.databaseAuthToken): Promise<Client> {
  const db = createClient({ url, authToken });
  await migrate(db);
  return db;
}

// One client per process (survives dev hot reloads and warm serverless invocations).
// Bump SCHEMA_VERSION when SCHEMA/COLUMNS change so a cached client gets migrated too.
const SCHEMA_VERSION = 6;
const g = globalThis as unknown as { __trackerDb?: Promise<Client>; __trackerDbVersion?: number };
export function getDb(): Promise<Client> {
  if (!g.__trackerDb || g.__trackerDbVersion !== SCHEMA_VERSION) {
    const previous = g.__trackerDb;
    g.__trackerDb = (async () => {
      const existing = previous ? await previous.catch(() => null) : null;
      if (!existing) {
        const db = await openDb();
        // Dev/preview only (SEED_SAMPLE_DATA=true): an empty database gets the fake sample statement.
        const { sampleSeedingEnabled, seedSampleIfEmpty } = await import("./seedSample");
        if (sampleSeedingEnabled()) await seedSampleIfEmpty(db);
        return db;
      }
      await migrate(existing);
      return existing;
    })();
    g.__trackerDb.catch(() => {
      g.__trackerDb = undefined; // retry on the next request instead of caching a failure
    });
    g.__trackerDbVersion = SCHEMA_VERSION;
  }
  return g.__trackerDb;
}

/** Typed query helpers — libSQL rows are array-like objects keyed by column name. */
export async function all<T>(db: Db, sql: string, args: InValue[] = []): Promise<T[]> {
  const rs = await db.execute({ sql, args });
  return rs.rows.map((r) => ({ ...r }) as unknown as T);
}
export async function one<T>(db: Db, sql: string, args: InValue[] = []): Promise<T | undefined> {
  return (await all<T>(db, sql, args))[0];
}
export async function run(db: Db, sql: string, args: InValue[] = []): Promise<void> {
  await db.execute({ sql, args });
}

/** Same merchant across sources? Bank feeds say "UAB Lemon Gym", the CSV says "Lemon Gym". */
export function sameMerchant(a: string, b: string): boolean {
  if (a === b) return true;
  const ta = a.split("-").filter((t) => t.length > 2);
  const tb = b.split("-").filter((t) => t.length > 2);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((t) => long.includes(t)) || ta[0] === tb[0];
}

export type InsertStats = { inserted: number; updated: number; skipped: number };

const DAY = 86_400_000;
const shiftDate = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/**
 * Insert transactions idempotently. Rows already present (same id) are updated;
 * rows that look like the same payment imported from the *other* source
 * (CSV vs bank sync) within ±3 days are skipped. Reads happen in two queries and
 * writes in one batch, so this stays fast against a remote database.
 */
export async function insertTransactions(db: Db, rows: TxRow[]): Promise<InsertStats> {
  const stats: InsertStats = { inserted: 0, updated: 0, skipped: 0 };
  if (!rows.length) return stats;

  const dates = rows.map((r) => r.date).sort();
  const from = shiftDate(dates[0], -3);
  const to = shiftDate(dates[dates.length - 1], 3);
  const nearby = await all<{ id: string; source: string; date: string; amount_minor: number; currency: string; merchant_key: string }>(
    db,
    "SELECT id, source, date, amount_minor, currency, merchant_key FROM transactions WHERE date BETWEEN ? AND ?",
    [from, to],
  );
  const existingIds = new Set(nearby.map((r) => r.id));
  // Rows whose date moved outside the window (rare) are found by id directly.
  const unknown = rows.filter((r) => !existingIds.has(r.id)).map((r) => r.id);
  for (let i = 0; i < unknown.length; i += 500) {
    const chunk = unknown.slice(i, i + 500);
    const found = await all<{ id: string }>(db, `SELECT id FROM transactions WHERE id IN (${chunk.map(() => "?").join(",")})`, chunk);
    for (const f of found) existingIds.add(f.id);
  }

  // Each row from the other source can absorb at most one duplicate, so two genuinely
  // identical charges (e.g. two 0.99 app purchases) are not collapsed into one.
  const byAmount = new Map<string, typeof nearby>();
  for (const n of nearby) {
    const k = `${n.currency}|${n.amount_minor}`;
    byAmount.set(k, [...(byAmount.get(k) ?? []), n]);
  }
  const claimed = new Set<string>();
  const crossDup = (r: TxRow) => {
    const lo = shiftDate(r.date, -3);
    const hi = shiftDate(r.date, 3);
    const hit = (byAmount.get(`${r.currency}|${r.amount_minor}`) ?? []).find(
      (c) => c.source !== r.source && c.date >= lo && c.date <= hi && !claimed.has(c.id) && sameMerchant(c.merchant_key, r.merchant_key),
    );
    if (hit) claimed.add(hit.id);
    return Boolean(hit);
  };

  const writes: InStatement[] = [];
  for (const r of rows) {
    const already = existingIds.has(r.id);
    if (!already && crossDup(r)) {
      stats.skipped++;
      continue;
    }
    writes.push({
      sql: `INSERT INTO transactions (id, source, account, date, amount_minor, currency, description, merchant_key, type, state)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              date = excluded.date, amount_minor = excluded.amount_minor, description = excluded.description,
              merchant_key = excluded.merchant_key, type = excluded.type, state = excluded.state`,
      args: [r.id, r.source, r.account, r.date, r.amount_minor, r.currency, r.description, r.merchant_key, r.type, r.state],
    });
    existingIds.add(r.id);
    if (already) stats.updated++;
    else stats.inserted++;
  }
  // Batches are atomic; chunking keeps each request within hosted-DB size limits.
  // A failure mid-way is safe to retry: every write is an idempotent upsert.
  for (let i = 0; i < writes.length; i += 400) await db.batch(writes.slice(i, i + 400), "write");
  return stats;
}

export async function logImport(db: Db, source: string, s: InsertStats, message?: string) {
  await run(db, "INSERT INTO import_log (source, inserted, updated, skipped, message) VALUES (?, ?, ?, ?, ?)", [
    source,
    s.inserted,
    s.updated,
    s.skipped,
    message ?? null,
  ]);
}

/** Changes whenever transactions, overrides or exclusions change (see the triggers in SCHEMA). */
export async function dataVersion(db: Db): Promise<number> {
  return Number((await one<{ value: number }>(db, "SELECT value FROM meta WHERE key = 'data_version'"))?.value ?? 0);
}

export async function allTransactions(db: Db): Promise<TxRow[]> {
  return all<TxRow>(
    db,
    "SELECT id, source, account, date, amount_minor, currency, description, merchant_key, type, state FROM transactions ORDER BY date",
  );
}

export async function allExclusions(db: Db): Promise<Set<string>> {
  return new Set((await all<{ tx_id: string }>(db, "SELECT tx_id FROM tx_exclusions")).map((r) => r.tx_id));
}

const OVERRIDE_FIELDS = ["display_name", "category", "status", "color_slot"] as const;

/**
 * Upsert one override, changing only the fields present in `patch` (null clears a field).
 * One statement, so overlapping edits (e.g. a rename and a colour pick) never undo each other.
 */
export async function saveOverride(db: Db, key: string, patch: Partial<Omit<Override, "key">>): Promise<void> {
  const supplied = OVERRIDE_FIELDS.filter((f) => patch[f] !== undefined);
  if (!supplied.length) return;
  const set = supplied.map((f) => `${f} = excluded.${f}`).join(", ");
  await run(db, `INSERT INTO overrides (key, ${OVERRIDE_FIELDS.join(", ")}) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET ${set}`, [
    key,
    ...OVERRIDE_FIELDS.map((f) => patch[f] ?? null),
  ]);
}

export async function allOverrides(db: Db): Promise<Map<string, Override>> {
  const rows = await all<Override>(db, "SELECT key, display_name, category, status, color_slot FROM overrides");
  return new Map(rows.map((r) => [r.key, r]));
}
