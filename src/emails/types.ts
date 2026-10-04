// Inputs for the email templates. The notification runner fills these in; the templates only
// lay them out, so they stay easy to preview (`npm run email:dev`) and to test.

export type NotificationEmailProps = {
  title: string;
  body: string;
  /** Where "Open" leads: an app path ("/subscriptions?sub=…") or an absolute URL. */
  url?: string | null;
  /** Public origin for absolute links (APP_URL); relative links are left out without it. */
  appUrl?: string;
};

export type DigestEvent = {
  title: string;
  body: string;
  url?: string | null;
  /** ISO timestamp or YYYY-MM-DD. */
  at: string;
};

export type DigestRenewal = { name: string; date: string; amount: number; currency: string };

export type DigestSummary = {
  /** Currency the totals are in (the base currency). */
  currency: string;
  /** Monthly cost of active subscriptions after expected reimbursements. */
  netMonthlyCost: number;
  /** Expected monthly reimbursements already subtracted above ("after €X reimbursed"); 0/absent hides it. */
  reimbursedMonthly?: number;
  /** Renewals coming up in the next period. */
  upcomingRenewals: DigestRenewal[];
  /** Charges still waiting to be reimbursed. */
  outstandingReimbursements: { count: number; amount: number };
};

export type DigestEmailProps = {
  frequency: "weekly" | "monthly";
  /** Events since the previous digest, newest first. May be empty: the digest is still sent. */
  events: DigestEvent[];
  summary: DigestSummary;
  /** The user's IANA time zone (settings): event timestamps are shown as dates on that calendar. */
  timeZone: string;
  appUrl?: string;
};

export const APP_NAME = "Subscriptions";

/** Class names on table cells so the plain-text version separates them ("Label: value", "a · b"). */
export const TEXT_LABEL = "t-label";
export const TEXT_CELL = "t-cell";

/** An absolute http(s) link, or null (a relative path without an app URL, or another scheme such as javascript:). */
export function absoluteUrl(url: string | null | undefined, appUrl = ""): string | null {
  if (!url) return null;
  try {
    const resolved = appUrl ? new URL(url, `${appUrl}/`) : new URL(url);
    return resolved.protocol === "https:" || resolved.protocol === "http:" ? resolved.toString() : null;
  } catch {
    return null; // relative, with nothing to resolve it against
  }
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function digestSubject({ frequency, events }: Pick<DigestEmailProps, "frequency" | "events">): string {
  const label = frequency === "weekly" ? "Weekly" : "Monthly";
  return `${label} summary: ${events.length ? plural(events.length, "update") : "nothing new"}`;
}
