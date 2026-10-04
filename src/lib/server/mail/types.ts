// The one thing notification code needs from email: send a message. Adapters (Resend, SMTP)
// hide the transport, so swapping providers never touches the callers.

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative for clients that don't render HTML. */
  text: string;
};

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}
