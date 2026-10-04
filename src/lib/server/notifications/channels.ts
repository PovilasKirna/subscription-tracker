import type { NotificationType, Settings } from "../../settings";
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

/**
 * The channels set up on this server. None yet: the feed is the only destination until the
 * Web Push and email adapters are added here.
 */
export function configuredChannels(): NotificationChannel[] {
  return [];
}
