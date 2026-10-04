import webpush from "web-push";
import type { PushDevicesPayload } from "../../types";
import { config } from "../config";
import { type Db, getDb } from "../db";
import { deletePushSubscriptions, listPushSubscriptions, markPushDelivered, type PushTarget, toDevice, toTarget } from "./store";

// Web Push via VAPID (an open standard: the browser vendor's push service relays our encrypted
// message to the device; no account with anyone needed). public/sw.js turns it into a notification.

/** What public/sw.js expects in a push message. */
export type PushPayload = {
  title: string;
  body: string;
  /** App path opened when the notification is clicked, e.g. "/subscriptions?sub=…". */
  url: string;
  /** Notifications with the same tag replace each other on the device instead of piling up. */
  tag?: string;
};

export type VapidSettings = { publicKey: string; privateKey: string; subject: string };
export type VapidConfig = { vapid: VapidSettings; mailFrom: string; appUrl: string };

/**
 * Push services want a contact for the sender: VAPID_SUBJECT, else MAIL_FROM's address, else the
 * app's https URL. (Apple rejects a mailto:/URL that points at localhost.)
 */
export function vapidSubject(cfg: VapidConfig = { vapid: config.vapid, mailFrom: config.mail.from, appUrl: config.appUrl }): string {
  if (cfg.vapid.subject) return cfg.vapid.subject;
  const address = cfg.mailFrom.match(/<([^>]+)>/)?.[1] ?? cfg.mailFrom;
  if (/^[^\s@]+@[^\s@]+$/.test(address)) return `mailto:${address}`;
  return cfg.appUrl.startsWith("https://") ? cfg.appUrl : "";
}

export function pushSetup(cfg: VapidConfig = { vapid: config.vapid, mailFrom: config.mail.from, appUrl: config.appUrl }): {
  configured: boolean;
  problem: string | null;
  vapid: VapidSettings;
} {
  const vapid = { ...cfg.vapid, subject: vapidSubject(cfg) };
  const problem =
    !vapid.publicKey || !vapid.privateKey
      ? "Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (generate them with `npm run vapid`)."
      : !vapid.subject
        ? "Set VAPID_SUBJECT (e.g. mailto:you@example.com), or MAIL_FROM / an https APP_URL."
        : null;
  return { configured: !problem, problem, vapid };
}

/** Settings → Notifications → Devices: whether push is set up, and the subscribed devices. */
export async function pushDevices(db: Db): Promise<PushDevicesPayload> {
  const { configured, problem } = pushSetup();
  return { configured, problem, devices: (await listPushSubscriptions(db)).map(toDevice) };
}

export type DeliveryResult = {
  delivered: string[];
  /** Subscriptions the push service says no longer exist (404/410): unsubscribed or expired. */
  expired: string[];
  failed: { endpoint: string; error: string }[];
};

/** Sends to every target in parallel and sorts the outcomes. `send` is web-push in production. */
export async function deliverPush(targets: PushTarget[], send: (target: PushTarget) => Promise<unknown>): Promise<DeliveryResult> {
  const result: DeliveryResult = { delivered: [], expired: [], failed: [] };
  const outcomes = await Promise.allSettled(targets.map((t) => send(t)));
  outcomes.forEach((o, i) => {
    const { endpoint } = targets[i];
    if (o.status === "fulfilled") result.delivered.push(endpoint);
    else {
      const status = (o.reason as { statusCode?: number } | null)?.statusCode;
      if (status === 404 || status === 410) result.expired.push(endpoint);
      else result.failed.push({ endpoint, error: o.reason instanceof Error ? o.reason.message : String(o.reason) });
    }
  });
  return result;
}

export type PushSendSummary = { sent: number; removed: number; failed: string[] };

/**
 * Push to every stored device (or only `endpoints`). Gone subscriptions are deleted; successes
 * are timestamped. Throws when push isn't configured.
 */
export async function sendPush(payload: PushPayload, opts: { endpoints?: string[]; db?: Db } = {}): Promise<PushSendSummary> {
  const setup = pushSetup();
  if (!setup.configured) throw new Error(setup.problem ?? "Push notifications aren't set up.");
  const db = opts.db ?? (await getDb());
  const rows = await listPushSubscriptions(db);
  const targets = rows.filter((r) => !opts.endpoints || opts.endpoints.includes(r.endpoint)).map(toTarget);
  const body = JSON.stringify(payload);
  const result = await deliverPush(targets, (t) =>
    webpush.sendNotification(t, body, {
      vapidDetails: setup.vapid,
      TTL: 24 * 60 * 60, // a phone that's off for a day still gets it, later ones are dropped
      urgency: "normal",
      timeout: 15_000,
    }),
  );
  await deletePushSubscriptions(db, result.expired);
  await markPushDelivered(db, result.delivered);
  for (const f of result.failed) console.warn(`[push] ${new URL(f.endpoint).host}: ${f.error}`);
  return { sent: result.delivered.length, removed: result.expired.length, failed: result.failed.map((f) => f.error) };
}
