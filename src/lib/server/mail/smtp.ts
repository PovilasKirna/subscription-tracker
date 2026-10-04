import type { Mailer, MailMessage } from "./types";

type Transport = { sendMail(message: MailMessage & { from: string }): Promise<unknown> };

/** Any SMTP server (Gmail app password, Fastmail, your host's mailbox…) via nodemailer. */
export class SmtpMailer implements Mailer {
  private transport: Promise<Transport> | undefined;

  constructor(
    private readonly smtpUrl: string,
    private readonly from: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    // Loaded on first use, so deployments that use Resend never pay for it.
    this.transport ??= import("nodemailer").then((m) => m.createTransport(this.smtpUrl));
    await (await this.transport).sendMail({ ...message, from: this.from });
  }
}
