import { type Settings, type SettingsPatch, settingsFromStore, settingsRows } from "../settings";
import { all, type Db, one, run } from "./db";

// The `settings` table: user preferences (typed and defaulted in src/lib/settings.ts) plus a few
// keys of internal state under "state." (last tick, digest bookkeeping), never sent to the browser.

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await all<{ key: string; value: string }>(db, "SELECT key, value FROM settings WHERE key NOT LIKE 'state.%'");
  const stored = new Map<string, unknown>();
  for (const r of rows) {
    try {
      stored.set(r.key, JSON.parse(r.value));
    } catch {
      // A hand-edited, broken value falls back to the default.
    }
  }
  return settingsFromStore(stored);
}

/** Applies a validated patch (see parseSettingsPatch) and returns the full settings. */
export async function saveSettings(db: Db, patch: SettingsPatch): Promise<Settings> {
  const rows = settingsRows(await getSettings(db), patch);
  if (rows.length) {
    await db.batch(
      rows.map(([key, value]) => ({
        sql: "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        args: [key, JSON.stringify(value)],
      })),
      "write",
    );
  }
  return getSettings(db);
}

/** Internal state, e.g. `state.ticks`. Typed by the caller; null when missing or unreadable. */
export async function getState<T>(db: Db, key: `state.${string}`): Promise<T | null> {
  const row = await one<{ value: string }>(db, "SELECT value FROM settings WHERE key = ?", [key]);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export async function setState(db: Db, key: `state.${string}`, value: unknown): Promise<void> {
  await run(
    db,
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    [key, JSON.stringify(value)],
  );
}

/**
 * Sets `key` to `value` only if it currently holds `expected` (null = missing). True when this call
 * won, so two overlapping runs (say an hourly tick and a sync) can't both send the same digest.
 */
export async function swapState(db: Db, key: `state.${string}`, expected: unknown, value: unknown): Promise<boolean> {
  const json = JSON.stringify(value);
  const rs =
    expected === null
      ? await db.execute({ sql: "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", args: [key, json] })
      : await db.execute({
          sql: "UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ? AND value = ?",
          args: [json, key, JSON.stringify(expected)],
        });
  return rs.rowsAffected > 0;
}
