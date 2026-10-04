import type { MailProvider, MailStatusPayload } from "../../types";
import { config } from "../config";
import { ResendMailer } from "./resend";
import { SmtpMailer } from "./smtp";
import type { Mailer } from "./types";

export type { Mailer, MailMessage } from "./types";

// Email is optional: the adapter is chosen by which secret is set (Resend first, then SMTP),
// and with neither (or no MAIL_FROM) email is simply off.

export type MailConfig = { resendApiKey: string; smtpUrl: string; from: string };

export function mailProvider(cfg: MailConfig = config.mail): MailProvider | null {
  if (cfg.resendApiKey) return "resend";
  if (cfg.smtpUrl) return "smtp";
  return null;
}

export function mailStatus(cfg: MailConfig = config.mail): MailStatusPayload {
  const provider = mailProvider(cfg);
  const from = cfg.from || null;
  const problem = !provider
    ? "Set RESEND_API_KEY (or SMTP_URL) to send email."
    : !from
      ? "Set MAIL_FROM to the address emails are sent from."
      : null;
  return { provider, from, ready: !problem, problem };
}

/** The configured mailer, or null when email isn't set up. */
export function getMailer(cfg: MailConfig = config.mail, fetchImpl: typeof fetch = fetch): Mailer | null {
  if (!mailStatus(cfg).ready) return null;
  return mailProvider(cfg) === "resend" ? new ResendMailer(cfg.resendApiKey, cfg.from, fetchImpl) : new SmtpMailer(cfg.smtpUrl, cfg.from);
}
