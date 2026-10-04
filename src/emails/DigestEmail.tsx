import { Column, Heading, Hr, Link, Row, Section, Text } from "@react-email/components";
import { fullDate, money, shortDate } from "../lib/format";
import { colors, Layout, Lines, OpenButton, styles } from "./_components/Layout";
import { absoluteUrl, type DigestEmailProps, plural, TEXT_CELL, TEXT_LABEL } from "./types";

/** The weekly/monthly summary: totals first, then what's renewing, then what happened since the last one. */
export default function DigestEmail({ frequency, events, summary, appUrl }: DigestEmailProps) {
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

      <Stat label="Net monthly cost" value={net} note={netNote} />
      <Stat label="Upcoming renewals" value={renewals.length ? String(renewals.length) : "None"} />
      <Stat label="Waiting for reimbursement" value={count ? `${plural(count, "charge")} · ${m(amount)}` : "None"} />

      {renewals.length > 0 && (
        <Section>
          <Heading as="h2" style={styles.h2}>
            Renewing next {period}
          </Heading>
          {renewals.map((r) => (
            <Row key={`${r.name}|${r.date}`}>
              <Column className={TEXT_CELL} style={{ ...styles.body, color: colors.text }}>
                {r.name}
              </Column>
              <Column className={TEXT_CELL} style={{ ...styles.body, fontSize: "13px" }}>
                {fullDate(r.date)}
              </Column>
              <Column align="right" style={{ ...styles.body, color: colors.text }}>
                {m(r.amount, r.currency)}
              </Column>
            </Row>
          ))}
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
              {i > 0 && <Hr style={{ borderColor: colors.border, margin: "8px 0" }} />}
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
              <Text style={styles.small}>{shortDate(e.at.slice(0, 10))}</Text>
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

function Stat({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <Row>
      <Column className={TEXT_LABEL} style={{ ...styles.body, padding: "4px 0" }}>
        {label}
      </Column>
      <Column align="right" style={{ ...styles.body, padding: "4px 0", color: colors.text, fontWeight: 600 }}>
        {value}
        {note && <div style={{ ...styles.small, fontWeight: 400 }}>{note}</div>}
      </Column>
    </Row>
  );
}

DigestEmail.PreviewProps = {
  frequency: "weekly",
  appUrl: "https://subs.example.com",
  summary: {
    currency: "EUR",
    netMonthlyCost: 84.37,
    reimbursedMonthly: 18,
    upcomingRenewals: [{ name: "Hostinger", date: "2026-10-09", amount: 47.88, currency: "EUR" }],
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
