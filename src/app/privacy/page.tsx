import type { Metadata } from "next";
import { Contact, LegalPage, Section } from "@/components/legal/LegalPage";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: `Privacy Policy · ${site.name}`, robots: { index: true, follow: true } };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          {site.name} ({site.url.replace("https://", "")}) is a private, non-commercial tool operated by {site.operator} to track personal
          subscriptions and recurring payments. Access is limited to its owner. This policy explains what data the app processes and why.
        </p>
      }
    >
      <Section title="Who is responsible">
        <p>
          {site.operator} is the controller of the data processed by this app. For any privacy question or request, contact <Contact />.
        </p>
      </Section>

      <Section title="What data is processed">
        <ul>
          <li>
            <b>Transaction data</b>: date, amount, currency, merchant or counterparty name, payment description and transaction type. It
            comes from bank statements the owner uploads (CSV) or from the owner&apos;s bank account through Open Banking, with explicit
            consent.
          </li>
          <li>
            <b>Account details</b> returned by the bank when access is granted: account name, currency, and an IBAN shown only masked (last
            4 digits).
          </li>
          <li>
            <b>Derived data</b>: detected subscriptions, renewal dates, price changes, and the owner&apos;s own edits (names, categories,
            statuses).
          </li>
          <li>
            <b>Technical data</b>: one strictly necessary session cookie that keeps the owner logged in, and standard server logs from the
            hosting provider (IP address, user agent, timestamps).
          </li>
        </ul>
        <p>Bank login credentials are never seen or stored by this app. You authenticate directly with your bank.</p>
      </Section>

      <Section title="Why it is processed">
        <p>
          Only to show the account owner their own subscriptions, recurring spending and upcoming charges. Data is never sold, shared for
          advertising, or used to profile anyone. The legal basis is the owner&apos;s consent (in particular for bank account access under
          PSD2) and the legitimate interest of running the service the owner asked for.
        </p>
      </Section>

      <Section title="Service providers">
        <ul>
          <li>
            <b>Enable Banking Oy</b> (Finland), a licensed account information service provider, connects to the bank with the owner&apos;s
            consent and returns account and transaction data. It has read-only access and cannot initiate payments.
          </li>
          <li>
            <b>Vercel Inc.</b> hosts the application.
          </li>
          <li>
            <b>Turso</b> (ChiselStrike Inc.) hosts the application database.
          </li>
        </ul>
        <p>These providers process data on the app&apos;s behalf, under their own security and data protection terms.</p>
      </Section>

      <Section title="How long data is kept">
        <ul>
          <li>Transaction and subscription data is kept until the owner deletes it.</li>
          <li>Bank access lasts at most 180 days per consent and can be revoked earlier at any time.</li>
          <li>Hosting providers&apos; logs follow their own retention periods.</li>
        </ul>
      </Section>

      <Section title="Your rights and controls">
        <ul>
          <li>
            <b>Export</b>: download all stored data as JSON from the Data & sync page.
          </li>
          <li>
            <b>Delete</b>: &quot;Delete all data&quot; on the Data & sync page permanently removes all transactions and edits.
          </li>
          <li>
            <b>Withdraw consent</b>: disconnect the bank on the Data & sync page, or revoke access from within your banking app.
          </li>
          <li>
            You can also request access, correction or erasure by contacting <Contact />, and you may lodge a complaint with your data
            protection authority.
          </li>
        </ul>
      </Section>

      <Section title="Security">
        <p>
          All traffic is encrypted with HTTPS. The app is protected by a password, sessions use signed, HTTP-only cookies, and secrets are
          stored as encrypted environment variables. Access to bank data is read-only.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          The app sets a single strictly necessary cookie (<code>st_session</code>) after login. There are no analytics, advertising or
          third-party tracking cookies.
        </p>
      </Section>

      <Section title="Changes">
        <p>If this policy changes, the date at the top of this page will be updated.</p>
      </Section>
    </LegalPage>
  );
}
