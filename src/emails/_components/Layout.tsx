import { type CSSProperties, Fragment, type ReactNode } from "react";
import { Body, Button, Container, Head, Html, Link, Preview, Section, Text } from "react-email";
import { APP_NAME, absoluteUrl } from "../types";

// Shared frame for every email: app name, a white card, and a footer linking to the settings.
// Light only and inline styles: email clients ignore most CSS (and dark-mode tokens).

export const colors = {
  page: "#f9f9f7",
  card: "#ffffff",
  border: "#e1e0d9",
  text: "#0b0b0b",
  muted: "#52514e",
  faint: "#898781",
  accent: "#2a78d6",
};

const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const styles = {
  h1: { margin: "0 0 8px", fontSize: "18px", lineHeight: "26px", fontWeight: 600, color: colors.text },
  h2: { margin: "20px 0 4px", fontSize: "14px", lineHeight: "20px", fontWeight: 600, color: colors.text },
  body: { margin: 0, fontSize: "14px", lineHeight: "22px", color: colors.muted },
  small: { margin: 0, fontSize: "12px", lineHeight: "18px", color: colors.faint },
} satisfies Record<string, CSSProperties>;

export function Layout({ preview, appUrl, children }: { preview: string; appUrl?: string; children: ReactNode }) {
  const settings = absoluteUrl("/settings/notifications", appUrl);
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: "24px 12px", backgroundColor: colors.page, fontFamily: font, color: colors.text }}>
        <Container style={{ maxWidth: "560px" }}>
          <Text style={{ margin: "0 4px 12px", fontSize: "13px", fontWeight: 600, color: colors.muted }}>{APP_NAME}</Text>
          <Section style={{ backgroundColor: colors.card, border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "24px" }}>
            {children}
          </Section>
          <Text style={{ ...styles.small, margin: "16px 4px" }}>
            {`You get these emails because they're turned on in ${APP_NAME}. `}
            {settings && (
              <Link href={settings} style={{ color: colors.faint, textDecoration: "underline" }}>
                Notification settings
              </Link>
            )}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/** Multi-line text with its line breaks kept (in the HTML and in the plain-text version). */
export function Lines({ text }: { text: string }) {
  return text.split(/\r?\n/).map((line, i, all) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: the lines of one fixed string
    <Fragment key={i}>
      {line}
      {i < all.length - 1 && <br />}
    </Fragment>
  ));
}

export function OpenButton({ href }: { href: string }) {
  return (
    <Section style={{ marginTop: "20px" }}>
      <Button
        href={href}
        style={{
          backgroundColor: colors.accent,
          color: "#ffffff",
          fontSize: "14px",
          fontWeight: 600,
          padding: "10px 18px",
          borderRadius: "8px",
          textDecoration: "none",
        }}
      >
        {`Open ${APP_NAME}`}
      </Button>
    </Section>
  );
}
