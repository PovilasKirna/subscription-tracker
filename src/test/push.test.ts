import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDb, run } from "../lib/server/db";
import { deviceName } from "../lib/server/push/device";
import { deliverPush, pushSetup, vapidSubject } from "../lib/server/push/send";
import { listPushSubscriptions, parsePushSubscription, savePushSubscription } from "../lib/server/push/store";

const UA = {
  chromeWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  firefoxMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  samsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  chromeLinux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
};

test("device names from user agents", () => {
  assert.equal(deviceName(UA.chromeWindows), "Chrome on Windows");
  assert.equal(deviceName(UA.edgeWindows), "Edge on Windows");
  assert.equal(deviceName(UA.firefoxMac), "Firefox on macOS");
  assert.equal(deviceName(UA.safariMac), "Safari on macOS");
  assert.equal(deviceName(UA.iphone), "iPhone");
  assert.equal(deviceName(UA.ipad), "iPad");
  assert.equal(deviceName(UA.chromeAndroid), "Chrome on Android");
  assert.equal(deviceName(UA.samsung), "Samsung Internet on Android");
  assert.equal(deviceName(UA.chromeLinux), "Chrome on Linux");
  assert.equal(deviceName(""), "Unknown device");
  assert.equal(deviceName(null), "Unknown device");
});

test("push subscriptions from the browser are validated", () => {
  const ok = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BPk", auth: "xyz" } };
  assert.deepEqual(parsePushSubscription({ ...ok, expirationTime: null }), ok);
  assert.equal(parsePushSubscription({ ...ok, endpoint: "http://insecure.example/x" }), null);
  assert.equal(parsePushSubscription({ ...ok, endpoint: "not a url" }), null);
  assert.equal(parsePushSubscription({ endpoint: ok.endpoint }), null);
  assert.equal(parsePushSubscription({ ...ok, keys: { p256dh: "", auth: "x" } }), null);
  assert.equal(parsePushSubscription(null), null);
});

test("delivery sorts outcomes; 404/410 mean the subscription is gone", async () => {
  const targets = ["a", "b", "c", "d"].map((x) => ({ endpoint: `https://push.example/${x}`, keys: { p256dh: "k", auth: "a" } }));
  const fail = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });
  const result = await deliverPush(targets, async (t) => {
    if (t.endpoint.endsWith("b")) throw fail(410, "Gone");
    if (t.endpoint.endsWith("c")) throw fail(404, "Not Found");
    if (t.endpoint.endsWith("d")) throw fail(500, "Server error");
  });
  assert.deepEqual(result.delivered, ["https://push.example/a"]);
  assert.deepEqual(result.expired, ["https://push.example/b", "https://push.example/c"]);
  assert.deepEqual(result.failed, [{ endpoint: "https://push.example/d", error: "Server error" }]);
});

test("VAPID subject falls back to MAIL_FROM, then an https APP_URL", () => {
  const vapid = { publicKey: "pub", privateKey: "priv", subject: "" };
  assert.equal(vapidSubject({ vapid: { ...vapid, subject: "mailto:me@x.com" }, mailFrom: "a@b.com", appUrl: "" }), "mailto:me@x.com");
  assert.equal(
    vapidSubject({ vapid, mailFrom: "Subscriptions <notifications@example.com>", appUrl: "" }),
    "mailto:notifications@example.com",
  );
  assert.equal(vapidSubject({ vapid, mailFrom: "", appUrl: "https://subs.example.com" }), "https://subs.example.com");
  assert.equal(vapidSubject({ vapid, mailFrom: "", appUrl: "http://localhost:3000" }), "");

  assert.equal(pushSetup({ vapid, mailFrom: "a@b.com", appUrl: "" }).configured, true);
  assert.match(pushSetup({ vapid: { ...vapid, privateKey: "" }, mailFrom: "a@b.com", appUrl: "" }).problem ?? "", /npm run vapid/);
  assert.match(pushSetup({ vapid, mailFrom: "", appUrl: "" }).problem ?? "", /VAPID_SUBJECT/);
});

test("a rotated subscription replaces its old row and keeps the creation date", async () => {
  const dir = mkdtempSync(join(tmpdir(), "subtracker-push-"));
  const db = await openDb(`file:${join(dir, "push.db").replaceAll("\\", "/")}`);
  const keys = { p256dh: "p", auth: "a" };
  const ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
  await savePushSubscription(db, { endpoint: "https://push.example/old", keys }, ua);
  await savePushSubscription(db, { endpoint: "https://push.example/other", keys }, ua);
  await run(db, "UPDATE push_subscriptions SET created_at = '2026-09-01 10:00:00' WHERE endpoint = ?", ["https://push.example/old"]);

  const device = await savePushSubscription(db, { endpoint: "https://push.example/new", keys }, ua, "https://push.example/old");
  assert.equal(device.createdAt, "2026-09-01T10:00:00Z");
  const endpoints = (await listPushSubscriptions(db)).map((r) => r.endpoint);
  assert.deepEqual(endpoints.sort(), ["https://push.example/new", "https://push.example/other"]);

  // Replacing itself (the browser kept the endpoint) is a plain refresh.
  await savePushSubscription(db, { endpoint: "https://push.example/new", keys }, ua, "https://push.example/new");
  assert.equal((await listPushSubscriptions(db)).length, 2);
  db.close();
});
