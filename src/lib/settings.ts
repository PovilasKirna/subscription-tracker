import { DEFAULT_TIME_ZONE, isValidTimeZone } from "./timeZone";

// User preferences (Settings → General / Notifications). Stored one key per row in the `settings`
// table; anything missing or invalid there falls back to the defaults below, so adding a
// preference never needs a migration. Client-safe: the settings pages validate with this too.

export const NOTIFICATION_TYPES = [
  "reimbursement_reminder",
  "bank_attention",
  "price_increase",
  "yearly_renewal",
  "new_subscription",
  "subscription_overdue",
  "sync_error",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const EMAIL_DELIVERIES = ["off", "immediate", "digest"] as const;
/** Email per notification type: never, one email right away, or collected into the digest. */
export type EmailDelivery = (typeof EMAIL_DELIVERIES)[number];
export type DeliveryPreference = { push: boolean; email: EmailDelivery };

export const DIGEST_FREQUENCIES = ["weekly", "monthly", "off"] as const;
export type DigestFrequency = (typeof DIGEST_FREQUENCIES)[number];

export type Settings = {
  /** IANA time zone the reminder day, delivery hour and digest day are read in. */
  timeZone: string;
  /** Hour of the day (0–23, in `timeZone`) reminders and digests go out at the earliest. */
  deliveryHour: number;
  notifications: Record<NotificationType, DeliveryPreference>;
  /** Weekly on Mondays, monthly on the 1st, or never. */
  digestFrequency: DigestFrequency;
  /** Where email notifications go; "" = nowhere yet. */
  emailRecipient: string;
};

export const DEFAULT_SETTINGS: Settings = {
  timeZone: DEFAULT_TIME_ZONE,
  deliveryHour: 9,
  notifications: {
    reimbursement_reminder: { push: true, email: "immediate" },
    bank_attention: { push: true, email: "immediate" },
    price_increase: { push: true, email: "digest" },
    yearly_renewal: { push: true, email: "digest" },
    new_subscription: { push: false, email: "digest" },
    subscription_overdue: { push: false, email: "digest" },
    sync_error: { push: false, email: "off" },
  },
  digestFrequency: "weekly",
  emailRecipient: "",
};

/** What each type is, for the preferences matrix and the feed. */
export const NOTIFICATION_TYPE_INFO: Record<NotificationType, { label: string; description: string }> = {
  reimbursement_reminder: {
    label: "Reimbursement reminders",
    description: "On a source's reminder day, when charges are still waiting to be requested.",
  },
  bank_attention: { label: "Bank connection", description: "A bank needs reconnecting, or its access ends within 7 days." },
  price_increase: { label: "Price increases", description: "A subscription started charging more." },
  yearly_renewal: { label: "Yearly renewals", description: "A yearly subscription renews in 7 days." },
  new_subscription: { label: "New subscriptions", description: "A new recurring charge was detected." },
  subscription_overdue: { label: "Overdue subscriptions", description: "An expected charge hasn't arrived." },
  sync_error: { label: "Sync errors", description: "A bank sync failed." },
};

const LOOKS_LIKE_EMAIL = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isHour = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23;
const isEmailDelivery = (v: unknown): v is EmailDelivery => EMAIL_DELIVERIES.includes(v as EmailDelivery);
const isDigestFrequency = (v: unknown): v is DigestFrequency => DIGEST_FREQUENCIES.includes(v as DigestFrequency);
const isRecipient = (v: unknown): v is string => typeof v === "string" && (v === "" || (v.length <= 254 && LOOKS_LIKE_EMAIL.test(v)));

/** Partial update accepted by `PUT /api/settings`; a type's preference may be given in part. */
export type SettingsPatch = Partial<Omit<Settings, "notifications">> & {
  notifications?: Partial<Record<NotificationType, Partial<DeliveryPreference>>>;
};

/** Validates a `PUT /api/settings` body. Unknown keys are rejected so typos don't silently do nothing. */
export function parseSettingsPatch(input: unknown): { patch: SettingsPatch } | { error: string } {
  if (!isRecord(input)) return { error: "Expected a JSON object" };
  const patch: SettingsPatch = {};
  for (const [key, value] of Object.entries(input)) {
    switch (key) {
      case "timeZone":
        if (!isValidTimeZone(value)) return { error: "Unknown time zone" };
        patch.timeZone = value;
        break;
      case "deliveryHour":
        if (!isHour(value)) return { error: "The delivery hour must be a whole hour from 0 to 23" };
        patch.deliveryHour = value;
        break;
      case "digestFrequency":
        if (!isDigestFrequency(value)) return { error: "The digest is weekly, monthly or off" };
        patch.digestFrequency = value;
        break;
      case "emailRecipient": {
        const v = typeof value === "string" ? value.trim() : value;
        if (!isRecipient(v)) return { error: "Enter a valid email address" };
        patch.emailRecipient = v;
        break;
      }
      case "notifications": {
        if (!isRecord(value)) return { error: "Expected notification preferences per type" };
        const prefs: NonNullable<SettingsPatch["notifications"]> = {};
        for (const [type, pref] of Object.entries(value)) {
          if (!NOTIFICATION_TYPES.includes(type as NotificationType)) return { error: `Unknown notification type: ${type}` };
          if (!isRecord(pref)) return { error: `Expected { push, email } for ${type}` };
          const out: Partial<DeliveryPreference> = {};
          for (const [k, v] of Object.entries(pref)) {
            if (k === "push" && typeof v === "boolean") out.push = v;
            else if (k === "email" && isEmailDelivery(v)) out.email = v;
            else return { error: `Invalid ${k} preference for ${type}` };
          }
          prefs[type as NotificationType] = out;
        }
        patch.notifications = prefs;
        break;
      }
      default:
        return { error: `Unknown setting: ${key}` };
    }
  }
  return { patch };
}

/** Stored key → value pairs (parsed JSON) to full settings: defaults fill anything missing or invalid. */
export function settingsFromStore(stored: ReadonlyMap<string, unknown>): Settings {
  const pick = <T>(key: string, valid: (v: unknown) => v is T, fallback: T): T => {
    const v = stored.get(key);
    return valid(v) ? v : fallback;
  };
  const notifications = { ...DEFAULT_SETTINGS.notifications };
  for (const type of NOTIFICATION_TYPES) {
    const v = stored.get(`notify.${type}`);
    const d = DEFAULT_SETTINGS.notifications[type];
    notifications[type] = isRecord(v)
      ? { push: typeof v.push === "boolean" ? v.push : d.push, email: isEmailDelivery(v.email) ? v.email : d.email }
      : d;
  }
  return {
    timeZone: pick("timeZone", isValidTimeZone, DEFAULT_SETTINGS.timeZone),
    deliveryHour: pick("deliveryHour", isHour, DEFAULT_SETTINGS.deliveryHour),
    notifications,
    digestFrequency: pick("digestFrequency", isDigestFrequency, DEFAULT_SETTINGS.digestFrequency),
    emailRecipient: pick("emailRecipient", isRecipient, DEFAULT_SETTINGS.emailRecipient),
  };
}

/** The rows a patch writes (key → JSON value), merged onto the current settings. */
export function settingsRows(current: Settings, patch: SettingsPatch): [string, unknown][] {
  const rows: [string, unknown][] = [];
  if (patch.timeZone !== undefined) rows.push(["timeZone", patch.timeZone]);
  if (patch.deliveryHour !== undefined) rows.push(["deliveryHour", patch.deliveryHour]);
  if (patch.digestFrequency !== undefined) rows.push(["digestFrequency", patch.digestFrequency]);
  if (patch.emailRecipient !== undefined) rows.push(["emailRecipient", patch.emailRecipient]);
  for (const [type, pref] of Object.entries(patch.notifications ?? {}) as [NotificationType, Partial<DeliveryPreference>][]) {
    rows.push([`notify.${type}`, { ...current.notifications[type], ...pref }]);
  }
  return rows;
}
