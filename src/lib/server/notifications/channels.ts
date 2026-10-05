import type { NotificationType, Settings } from "../../settings";
import { config } from "../config";
import { type Db, getDb } from "../db";
import { getMailer, type Mailer } from "../mail";
import type { EmailContent } from "../mail/templates";
import { type PushPayload, type PushSendSummary, pushSetup, sendPush } from "../push/send";
import { listPushSubscriptions } from "../push/store";
import type { DigestInput } from "./plan";

// Where notifications go besides the in-app feed. A channel wraps one transport (Web Push, email)
// behind this small interface, so the runner never knows how delivery works. Push is immediate
// only; email can be immediate or part of the digest.

export type ChannelKind = "push" | "email";

/** One notification on its way out (what both the push payload and the email template need). */
export type OutgoingNotification = {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  /** App path it opens, e.g. "/subscriptions?sub=…"; channels make it absolute if they need to. */
  url: string | null;
  /** Same-topic notifications replace each other on a device (the dedupe key). */
  tag: string;
  createdAt: string;
};

export interface NotificationChannel {
  readonly kind: ChannelKind;
  /** Whether it can deliver right now (configured, and e.g. a recipient address is set). */
  ready(settings: Settings): boolean;
  /** Delivers one notification. Throwing leaves it unsent, so a later run retries it. */
  send(notification: OutgoingNotification, settings: Settings): Promise<void>;
  /** Email only: delivers the weekly/monthly digest. */
  sendDigest?(digest: DigestInput, settings: Settings): Promise<void>;
}

/** Web Push to every subscribed device. `send` is sendPush in production. */
export function pushChannel(deps: {
  /** VAPID keys are set. */
  configured: boolean;
  /** Devices subscribed right now (nothing to push to without one). */
  devices: number;
  send: (payload: PushPayload) => Promise<PushSendSummary>;
}): NotificationChannel {
  return {
    kind: "push",
    ready: () => deps.configured && deps.devices > 0,
    async send(n) {
      // An app path: the service worker opens it on its own origin (and refuses any other).
      const result = await deps.send({ title: n.title, body: n.body, url: n.url ?? "/", tag: n.tag });
      // Some device got it: done (a retry would repeat it there). None did because the push service
      // failed: throw, so the next run retries. Every device turned out to be gone: nothing to retry.
      if (!result.sent && result.failed.length) throw new Error(`Push failed: ${result.failed[0]}`);
    },
  };
}

/** Turns a notification or digest into an email (the React Email templates in production). */
export type EmailRenderers = {
  notification(props: { title: string; body: string; url: string | null; appUrl: string }): Promise<EmailContent>;
  digest(props: DigestInput & { appUrl: string }): Promise<EmailContent>;
};

/** Email to the recipient saved in settings: one per notification, or the digest. */
export function emailChannel(deps: {
  mailer: Mailer | null;
  /** Public origin for links (APP_URL); "" leaves links into the app out. */
  appUrl: string;
  render: EmailRenderers;
}): NotificationChannel {
  const { mailer, appUrl, render } = deps;
  const send = async (to: string, email: () => Promise<EmailContent>) => {
    if (!mailer || !to) throw new Error("Email isn't set up.");
    await mailer.send({ to, ...(await email()) });
  };
  return {
    kind: "email",
    ready: (settings) => mailer !== null && settings.emailRecipient !== "",
    send: (n, settings) => send(settings.emailRecipient, () => render.notification({ title: n.title, body: n.body, url: n.url, appUrl })),
    sendDigest: (digest, settings) =>
      send(settings.emailRecipient, () => render.digest({ ...digest, timeZone: settings.timeZone, appUrl })),
  };
}

/**
 * The channels set up on this server: push when the VAPID keys are set (ready once a device is
 * subscribed), email when a mailer is configured (ready once a recipient is saved).
 */
export async function configuredChannels(db?: Db): Promise<NotificationChannel[]> {
  const channels: NotificationChannel[] = [];
  if (pushSetup().configured) {
    const database = db ?? (await getDb());
    const devices = (await listPushSubscriptions(database)).length;
    channels.push(pushChannel({ configured: true, devices, send: (payload) => sendPush(payload, { db: database }) }));
  }
  const mailer = getMailer();
  if (mailer) {
    channels.push(
      emailChannel({
        mailer,
        appUrl: config.appUrl,
        render: {
          // Loaded on use: rendering needs react-dom/server, which nothing else in the runner does.
          notification: async (props) => (await import("../mail/templates")).renderNotificationEmail(props),
          digest: async (props) => (await import("../mail/templates")).renderDigestEmail(props),
        },
      }),
    );
  }
  return channels;
}
