import type { ReactNode } from "react";
import { Heading, Hr, Link, Section, Text } from "react-email";
import { localDate, money, shortDate } from "../lib/format";
import { colors, Layout, Lines, OpenButton, styles } from "./_components/Layout";
import { absoluteUrl, type DigestEmailProps, planName, plural, renewalsHeading, TEXT_CELL, TEXT_LABEL } from "./types";

/** The weekly/monthly summary: totals first, then what's renewing, then what happened since the last one. */
export default function DigestEmail({ frequency, events, summary, timeZone, appUrl }: DigestEmailProps) {
  const period = frequency === "weekly" ? "week" : "month";
  const m = (n: number, currency = summary.currency) => money(n, currency);
  const net = `${m(summary.netMonthlyCost)} / month`;
  const netNote = summary.reimbursedMonthly ? `after ${m(summary.reimbursedMonthly)} reimbursed` : null;
  const { count, amount } = summary.outstandingReimbursements;
  const renewals = summary.upcomingRenewals;
  const appLink = absoluteUrl("/", appUrl);

  return (
    <Layout preview={`${net}${netNote ? ` (${netNote})` : ""} · ${plural(renewals.length, "upcoming renewal")}`} appUrl={appUrl}>
      <Heading as="h1" style={{ ...styles.h1, marginBottom: "12px" }}>
        Your {frequency} summary
      </Heading>

      <DataTable>
        <Stat label="Net monthly cost" value={net} note={netNote} />
        <Stat label="Upcoming renewals" value={renewals.length ? String(renewals.length) : "None"} />
        <Stat label="Waiting for reimbursement" value={count ? `${plural(count, "charge")} · ${m(amount)}` : "None"} />
      </DataTable>

      {renewals.length > 0 && (
        <Section>
          <Heading as="h2" style={styles.h2}>
            {renewalsHeading(frequency)}
          </Heading>
          <DataTable>
            {renewals.map((r, i) => {
              const cell = {
                ...styles.body,
                padding: "6px 0",
                verticalAlign: "top",
                ...(i > 0 && { borderTop: `1px solid ${colors.border}` }),
              };
              return (
                <tr key={`${r.name}|${r.date}`}>
                  <td className={TEXT_CELL} style={{ ...cell, color: colors.text, paddingRight: "12px", wordBreak: "break-word" }}>
                    {planName(r.name)}
                  </td>
                  <td
                    className={TEXT_CELL}
                    width={DATE_WIDTH}
                    style={{ ...cell, width: `${DATE_WIDTH}px`, fontSize: "13px", whiteSpace: "nowrap" }}
                  >
                    {shortDate(r.date)}
                  </td>
                  <td
                    align="right"
                    width={AMOUNT_WIDTH}
                    style={{ ...cell, width: `${AMOUNT_WIDTH}px`, color: colors.text, whiteSpace: "nowrap" }}
                  >
                    {m(r.amount, r.currency)}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </Section>
      )}

      <Heading as="h2" style={styles.h2}>
        Since your last summary
      </Heading>
      {events.length ? (
        events.map((e, i) => {
          const link = absoluteUrl(e.url, appUrl);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: events are a fixed list (titles can repeat)
            <Section key={i}>
              {i > 0 && <Hr style={{ borderTop: `1px solid ${colors.border}`, margin: "8px 0" }} />}
              <Text style={{ ...styles.body, color: colors.text, fontWeight: 600 }}>
                {link ? (
                  <Link href={link} style={{ color: colors.text, textDecoration: "none" }}>
                    {e.title}
                  </Link>
                ) : (
                  e.title
                )}
              </Text>
              <Text style={{ ...styles.body, fontSize: "13px", lineHeight: "20px" }}>
                <Lines text={e.body} />
              </Text>
              <Text style={styles.small}>{shortDate(localDate(e.at, timeZone))}</Text>
            </Section>
          );
        })
      ) : (
        <Text style={styles.body}>Nothing new this {period}: no price changes, new subscriptions or reminders.</Text>
      )}

      {appLink && <OpenButton href={appLink} />}
    </Layout>
  );
}

// Fixed widths (in px) of the renewals' date and amount columns; the name takes the rest, so every
// row's columns line up (also at phone width, where the name wraps). Dates are short ("9 Oct"): the
// list never reaches past the end of the current week or month.
const DATE_WIDTH = 64;
const AMOUNT_WIDTH = 80;

/**
 * One table for a whole list, so its columns line up in every client (a react-email Row per line is
 * a table of its own, sized to its own content). Fixed layout: the widths on the cells decide.
 */
function DataTable({ children }: { children: ReactNode }) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}
    >
      <tbody>{children}</tbody>
    </table>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string | null }) {
  const cell = { ...styles.body, padding: "4px 0", verticalAlign: "top" } as const;
  return (
    <tr>
      <td className={TEXT_LABEL} style={{ ...cell, paddingRight: "12px" }}>
        {label}
      </td>
      <td align="right" width="45%" style={{ ...cell, width: "45%", color: colors.text, fontWeight: 600 }}>
        {value}
        {note && <div style={{ ...styles.small, fontWeight: 400 }}>{note}</div>}
      </td>
    </tr>
  );
}

DigestEmail.PreviewProps = {
  frequency: "weekly",
  timeZone: "Europe/Vilnius",
  appUrl: "https://subs.example.com",
  summary: {
    currency: "EUR",
    netMonthlyCost: 84.37,
    reimbursedMonthly: 18,
    upcomingRenewals: [
      { name: "Netflix", date: "2026-10-07", amount: 15.99, currency: "EUR" },
      { name: "Apple (App Store) · 9.99", date: "2026-10-09", amount: 9.99, currency: "EUR" },
      { name: "Hostinger", date: "2026-10-09", amount: 47.88, currency: "EUR" },
      { name: "Revolut plan", date: "2026-10-11", amount: 7.99, currency: "EUR" },
    ],
    outstandingReimbursements: { count: 2, amount: 36 },
  },
  events: [
    {
      title: "Spotify price went up",
      body: "€10.99 → €11.99 a month from 4 Oct.",
      url: "/subscriptions?sub=spotify",
      at: "2026-10-04T08:00:00Z",
    },
    { title: "New subscription: ChatGPT", body: "€20.00 monthly, first charged 1 Oct.", url: "/subscriptions", at: "2026-10-01T09:00:00Z" },
  ],
} satisfies DigestEmailProps;
