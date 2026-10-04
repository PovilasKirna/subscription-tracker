import { createElement } from "react";
import { render } from "react-email";
import DigestEmail from "../../../emails/DigestEmail";
import NotificationEmail from "../../../emails/NotificationEmail";
import { type DigestEmailProps, digestSubject, type NotificationEmailProps, TEXT_CELL, TEXT_LABEL } from "../../../emails/types";

// Renders the React Email templates (src/emails) into what every Mailer sends: subject, HTML and
// a plain-text alternative. React escapes all text, so merchant names can't inject markup.

export type { DigestEmailProps, DigestEvent, DigestRenewal, DigestSummary, NotificationEmailProps } from "../../../emails/types";

export type EmailContent = { subject: string; html: string; text: string };

// The bits of html-to-text's formatter API used below (it ships no types of its own).
type TextBuilder = { addInline(text: string): void };
type TextFormatter = (
  elem: { children: unknown[] },
  walk: (nodes: unknown[], builder: TextBuilder) => void,
  builder: TextBuilder,
  options: { suffix?: string },
) => void;

const suffix: TextFormatter = (elem, walk, builder, options) => {
  walk(elem.children, builder);
  builder.addInline(options.suffix ?? " ");
};

/**
 * Table cells and rows run together in plain text ("Net monthly cost€84.37"): every row gets its
 * own line and marked cells a separator.
 */
const textOptions = {
  formatters: { suffix },
  selectors: [
    { selector: "tr", format: "block", options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
    { selector: `td.${TEXT_LABEL}`, format: "suffix", options: { suffix: ": " } },
    { selector: `td.${TEXT_CELL}`, format: "suffix", options: { suffix: " · " } },
    { selector: "h1", options: { uppercase: false } },
    { selector: "h2", options: { uppercase: false } },
  ],
};

async function both(element: ReturnType<typeof createElement>) {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true, htmlToTextOptions: textOptions })]);
  return { html, text: text.trim() };
}

export async function renderNotificationEmail(props: NotificationEmailProps): Promise<EmailContent> {
  return { subject: props.title, ...(await both(createElement(NotificationEmail, props))) };
}

export async function renderDigestEmail(props: DigestEmailProps): Promise<EmailContent> {
  return { subject: digestSubject(props), ...(await both(createElement(DigestEmail, props))) };
}
