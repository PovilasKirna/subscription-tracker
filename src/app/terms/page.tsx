import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalPage, Section } from "@/components/legal/LegalPage";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: `Terms of Service · ${site.name}`, robots: { index: true, follow: true } };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms apply to {site.name} ({site.url.replace("https://", "")}), a private, non-commercial tool operated by {site.operator}.
          By using the app you agree to them.
        </p>
      }
    >
      <Section title="The service">
        <p>
          The app analyses the user&apos;s own bank transactions to detect subscriptions and recurring payments and shows their cost and
          upcoming renewals. Transactions come from uploaded bank statements or from a read-only Open Banking connection provided by Enable
          Banking. The app cannot move money or make payments.
        </p>
      </Section>

      <Section title="Access">
        <p>
          The app is for personal use by its owner and anyone the owner explicitly authorises. Keep your password confidential. Access may
          be suspended at any time, for example to protect the security of the data.
        </p>
      </Section>

      <Section title="Bank connections">
        <p>
          Connecting a bank requires your explicit consent, which you give directly to your bank via Enable Banking. Access is read-only and
          lasts at most 180 days. You can revoke it at any time in Settings → Data & sync or in your banking app. The availability of bank
          connections depends on the bank and on Enable Banking.
        </p>
      </Section>

      <Section title="No financial advice">
        <p>
          Subscription detection is automatic and may be incomplete or wrong: a charge may be missed, misclassified, or have a different
          amount or date than projected. Everything shown is for information only and is not financial, tax or legal advice. Always check
          important figures against your bank.
        </p>
      </Section>

      <Section title="Your data">
        <p>
          You remain the owner of your data. You can export or delete it at any time, as described in the{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <Section title="Availability and liability">
        <p>
          The app is provided free of charge, &quot;as is&quot;, without warranties of any kind, and may change or stop at any time. To the
          extent permitted by law, the operator is not liable for indirect or consequential damages, or for losses resulting from reliance
          on the information shown or from the unavailability of third-party services (your bank, Enable Banking, the hosting or database
          providers).
        </p>
        <p>
          The source code is open source under the MIT License. If you run your own copy, you are its operator and responsible for your own
          deployment.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          These terms may be updated; the date at the top shows the latest version. Questions: <Contact />.
        </p>
      </Section>
    </LegalPage>
  );
}
