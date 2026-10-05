import type { Mailer, MailMessage } from "./types";

// Resend's REST API with plain fetch (no SDK): https://resend.com/docs/api-reference/emails/send-email

export const RESEND_ENDPOINT = "https://api.resend.com/emails";

export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send({ to, subject, html, text }: MailMessage): Promise<void> {
    const res = await this.fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return;
    // Errors come back as { statusCode, name, message }, e.g. an unverified sender domain.
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(`Resend rejected the email (${res.status}): ${body?.message ?? res.statusText}`);
  }
}
