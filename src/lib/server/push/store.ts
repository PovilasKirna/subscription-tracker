import type { PushDevice } from "../../types";
import { all, type Db, run } from "../db";
import { deviceName } from "./device";

// Push subscriptions as the browser hands them over (`PushSubscription.toJSON()`).

export type PushKeys = { p256dh: string; auth: string };

export type PushSubscriptionRow = {
  endpoint: string;
  keys_json: string;
  device_name: string;
  user_agent: string | null;
  created_at: string;
  last_success_at: string | null;
};

/** What web-push needs to deliver to one device. */
export type PushTarget = { endpoint: string; keys: PushKeys };

/** Validates an untrusted `PushSubscription.toJSON()` body; null when it isn't one. */
export function parsePushSubscription(input: unknown): PushTarget | null {
  const sub = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!sub || typeof sub.endpoint !== "string" || sub.endpoint.length > 2048) return null;
  try {
    if (new URL(sub.endpoint).protocol !== "https:") return null; // push services are always https
  } catch {
    return null;
  }
  const { p256dh, auth } = sub.keys ?? {};
  if (typeof p256dh !== "string" || typeof auth !== "string" || !p256dh || !auth || p256dh.length > 256 || auth.length > 256) return null;
  return { endpoint: sub.endpoint, keys: { p256dh, auth } };
}

/** Insert or refresh a subscription (re-subscribing the same browser keeps its row and creation date). */
export async function savePushSubscription(db: Db, target: PushTarget, userAgent: string | null): Promise<PushDevice> {
  const name = deviceName(userAgent);
  await run(
    db,
    `INSERT INTO push_subscriptions (endpoint, keys_json, device_name, user_agent) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET keys_json = excluded.keys_json, device_name = excluded.device_name, user_agent = excluded.user_agent`,
    [target.endpoint, JSON.stringify(target.keys), name, userAgent],
  );
  const [row] = await all<PushSubscriptionRow>(db, "SELECT * FROM push_subscriptions WHERE endpoint = ?", [target.endpoint]);
  return toDevice(row);
}

export async function listPushSubscriptions(db: Db): Promise<PushSubscriptionRow[]> {
  return all<PushSubscriptionRow>(db, "SELECT * FROM push_subscriptions ORDER BY created_at, endpoint");
}

export async function deletePushSubscriptions(db: Db, endpoints: string[]): Promise<void> {
  if (!endpoints.length) return;
  await db.batch(
    endpoints.map((e) => ({ sql: "DELETE FROM push_subscriptions WHERE endpoint = ?", args: [e] })),
    "write",
  );
}

export async function markPushDelivered(db: Db, endpoints: string[], at = new Date().toISOString()): Promise<void> {
  if (!endpoints.length) return;
  await db.batch(
    endpoints.map((e) => ({ sql: "UPDATE push_subscriptions SET last_success_at = ? WHERE endpoint = ?", args: [at, e] })),
    "write",
  );
}

export function toTarget(row: PushSubscriptionRow): PushTarget {
  return { endpoint: row.endpoint, keys: JSON.parse(row.keys_json) as PushKeys };
}

/** SQLite's datetime('now') ("2026-10-04 09:30:00", UTC) → ISO. */
const iso = (t: string) => (t.includes("T") ? t : `${t.replace(" ", "T")}Z`);

export function toDevice(row: PushSubscriptionRow): PushDevice {
  return { endpoint: row.endpoint, name: row.device_name, createdAt: iso(row.created_at), lastSuccessAt: row.last_success_at };
}
