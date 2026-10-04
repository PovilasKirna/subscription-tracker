import { type Client, createClient, type InStatement, type InValue } from "@libsql/client";
import type { ColorChoice, HexColor } from "../color";
import type { Cadence, ReimbursementMode } from "../types";
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
  /** Preset colour slot (1–8) the user picked, or `NO_COLOR_SLOT` for "none"; null = automatic. */
  color_slot: number | null;
  /** Custom `#rrggbb` colour the user picked; only set while `color_slot` is null. */
  color_hex: HexColor | null;
  /** How often it renews, as the user set it; null = detected from the charges. */
  cadence: Cadence | null;
  /** Website the logo is looked up from (e.g. "hostinger.com"); null = the built-in one, if any. */
  website: string | null;
};

/** `color_slot` for a subscription the user explicitly left uncoloured. */
export const NO_COLOR_SLOT = 0;

/** The override columns for a colour choice (null = back to automatic). */
export function colorColumns(choice: ColorChoice | null): Pick<Override, "color_slot" | "color_hex"> {
  if (choice === null) return { color_slot: null, color_hex: null };
  if (choice === "none") return { color_slot: NO_COLOR_SLOT, color_hex: null };
  if (typeof choice === "number") return { color_slot: choice, color_hex: null };
  return { color_slot: null, color_hex: choice.toLowerCase() as HexColor };
}

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

  -- One row per bank account, keyed by the stable account key (accountKey(), which is what
  -- transactions.account holds for bank rows), so preferences survive reconnects.
  -- included = 0 skips the account during sync and hides its transactions everywhere but exports.
  CREATE TABLE IF NOT EXISTS bank_accounts (
    account_key     TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL,
    name            TEXT,
    iban            TEXT,
    currency        TEXT,
    included        INTEGER NOT NULL DEFAULT 1,
    synced_through  TEXT -- ISO time of the last successful fetch of this account
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

  -- Charges the user put into a specific subscription by hand. A subscription with any
  -- assigned charge is "pinned": its membership no longer depends on automatic detection.
  CREATE TABLE IF NOT EXISTS tx_assignments (
    tx_id       TEXT PRIMARY KEY,
    sub_key     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS tx_assignments_sub ON tx_assignments(sub_key);

  -- Where reimbursements come from. "request": you file a request each time (and can forget),
  -- reminded on reminder_day (1–28). "automatic": paid without asking, so it's assumed.
  CREATE TABLE IF NOT EXISTS reimbursement_sources (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    mode          TEXT NOT NULL,
    reminder_day  INTEGER,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A subscription is reimbursed amount_minor per charge from starts_on until its next period.
  -- source_id NULL = "Stop reimbursing" from starts_on. Charges before the first period are
  -- ordinary spend.
  CREATE TABLE IF NOT EXISTS reimbursement_periods (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    sub_key       TEXT NOT NULL,
    source_id     INTEGER REFERENCES reimbursement_sources(id),
    amount_minor  INTEGER NOT NULL,
    starts_on     TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS reimbursement_periods_sub_start ON reimbursement_periods(sub_key, starts_on);

  -- What actually came back for a charge, entered by hand; always beats anything derived.
  -- 0 records that this charge won't be reimbursed (e.g. the request was never filed).
  CREATE TABLE IF NOT EXISTS reimbursements (
    tx_id         TEXT PRIMARY KEY,
    amount_minor  INTEGER NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
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
${["transactions", "overrides", "tx_exclusions", "tx_assignments", "reimbursement_sources", "reimbursement_periods", "reimbursements"]
  .flatMap((table) =>
    ["INSERT", "UPDATE", "DELETE"].map(
      (op) => `
  CREATE TRIGGER IF NOT EXISTS ${table}_${op.toLowerCase()}_version AFTER ${op} ON ${table}
  BEGIN UPDATE meta SET value = value + 1 WHERE key = 'data_version'; END;`,
    ),
  )
  .join("")}
  -- Only changes to which accounts are visible matter to detection (not every synced_through bump).
  CREATE TRIGGER IF NOT EXISTS bank_accounts_insert_version AFTER INSERT ON bank_accounts WHEN NEW.included = 0
  BEGIN UPDATE meta SET value = value + 1 WHERE key = 'data_version'; END;
  CREATE TRIGGER IF NOT EXISTS bank_accounts_update_version AFTER UPDATE OF included ON bank_accounts
  WHEN OLD.included IS NOT NEW.included
  BEGIN UPDATE meta SET value = value + 1 WHERE key = 'data_version'; END;
  CREATE TRIGGER IF NOT EXISTS bank_accounts_delete_version AFTER DELETE ON bank_accounts WHEN OLD.included = 0
  BEGIN UPDATE meta SET value = value + 1 WHERE key = 'data_version'; END;
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
  overrides: {
    color_slot: "INTEGER", // user-picked preset colour (0 = none); null = automatic
    color_hex: "TEXT", // user-picked custom colour
    cadence: "TEXT", // user-set renewal cadence; null = detected
    website: "TEXT", // user-set website for the logo; null = built-in
  },
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
const SCHEMA_VERSION = 12;
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

/** Changes whenever transactions, overrides, exclusions, assignments, included accounts or reimbursements change (see the triggers in SCHEMA). */
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

/** Transaction id → the subscription key the user assigned it to. */
export async function allAssignments(db: Db): Promise<Map<string, string>> {
  const rows = await all<{ tx_id: string; sub_key: string }>(db, "SELECT tx_id, sub_key FROM tx_assignments");
  return new Map(rows.map((r) => [r.tx_id, r.sub_key]));
}

const OVERRIDE_FIELDS = ["display_name", "category", "status", "color_slot", "color_hex", "cadence", "website"] as const;

/**
 * Upsert one override, changing only the fields present in `patch` (null clears a field).
 * One statement, so overlapping edits (e.g. a rename and a colour pick) never undo each other.
 */
export async function saveOverride(db: Db, key: string, patch: Partial<Omit<Override, "key">>): Promise<void> {
  const supplied = OVERRIDE_FIELDS.filter((f) => patch[f] !== undefined);
  if (!supplied.length) return;
  const set = supplied.map((f) => `${f} = excluded.${f}`).join(", ");
  await run(
    db,
    `INSERT INTO overrides (key, ${OVERRIDE_FIELDS.join(", ")}) VALUES (?, ${OVERRIDE_FIELDS.map(() => "?").join(", ")}) ON CONFLICT(key) DO UPDATE SET ${set}`,
    [key, ...OVERRIDE_FIELDS.map((f) => patch[f] ?? null)],
  );
}

export async function allOverrides(db: Db): Promise<Map<string, Override>> {
  const rows = await all<Override>(db, `SELECT key, ${OVERRIDE_FIELDS.join(", ")} FROM overrides`);
  return new Map(rows.map((r) => [r.key, r]));
}

export type SourceRow = { id: number; name: string; mode: ReimbursementMode; reminder_day: number | null };
export type PeriodRow = { id: number; sub_key: string; source_id: number | null; amount_minor: number; starts_on: string };

/** Everything reimbursements are derived from: sources, periods per subscription and recorded amounts. */
export type ReimbursementData = {
  sources: Map<number, SourceRow>;
  /** Subscription key → its periods, oldest first. */
  periods: Map<string, PeriodRow[]>;
  /** Transaction id → amount recorded for it (minor units, 0 = not reimbursed). */
  records: Map<string, number>;
};

export async function allSources(db: Db): Promise<SourceRow[]> {
  const rows = await all<SourceRow>(db, "SELECT id, name, mode, reminder_day FROM reimbursement_sources ORDER BY id");
  return rows.map((r) => ({ ...r, id: Number(r.id), reminder_day: r.reminder_day === null ? null : Number(r.reminder_day) }));
}

export async function allReimbursementData(db: Db): Promise<ReimbursementData> {
  const [sources, periodRows, records] = await Promise.all([
    allSources(db),
    all<PeriodRow>(db, "SELECT id, sub_key, source_id, amount_minor, starts_on FROM reimbursement_periods ORDER BY starts_on, id"),
    all<{ tx_id: string; amount_minor: number }>(db, "SELECT tx_id, amount_minor FROM reimbursements"),
  ]);
  const periods = new Map<string, PeriodRow[]>();
  for (const p of periodRows) {
    const row = {
      ...p,
      id: Number(p.id),
      source_id: p.source_id === null ? null : Number(p.source_id),
      amount_minor: Number(p.amount_minor),
    };
    const list = periods.get(p.sub_key);
    if (list) list.push(row);
    else periods.set(p.sub_key, [row]);
  }
  return {
    sources: new Map(sources.map((s) => [s.id, s])),
    periods,
    records: new Map(records.map((r) => [r.tx_id, Number(r.amount_minor)])),
  };
}

export type NewSource = { name: string; mode: ReimbursementMode; reminderDay: number | null };

export async function insertSource(db: Db, s: NewSource): Promise<number> {
  const row = await one<{ id: number }>(db, "INSERT INTO reimbursement_sources (name, mode, reminder_day) VALUES (?, ?, ?) RETURNING id", [
    s.name,
    s.mode,
    s.reminderDay,
  ]);
  return Number(row?.id);
}

/** Another source already has this name (case-insensitive)? */
export async function sourceNameTaken(db: Db, name: string, exceptId?: number): Promise<boolean> {
  return Boolean(
    await one(db, "SELECT 1 AS x FROM reimbursement_sources WHERE lower(name) = lower(?) AND id IS NOT ?", [name, exceptId ?? null]),
  );
}
