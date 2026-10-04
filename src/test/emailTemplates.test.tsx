// Runs without the react-server condition (see the "test" script): rendering emails needs react-dom/server.
import assert from "node:assert/strict";
import { test } from "node:test";
import DigestEmail from "../emails/DigestEmail";
import { absoluteUrl, type DigestEmailProps } from "../emails/types";
import { renderDigestEmail, renderNotificationEmail } from "../lib/server/mail/templates";

const APP = "https://subs.example.com";

test("absolute links resolve against APP_URL and refuse other schemes", () => {
  assert.equal(absoluteUrl("/subscriptions?sub=a", APP), "https://subs.example.com/subscriptions?sub=a");
  assert.equal(absoluteUrl("https://other.example/x", APP), "https://other.example/x");
  assert.equal(absoluteUrl("/subscriptions", ""), null); // nothing to resolve against
  assert.equal(absoluteUrl("javascript:alert(1)", APP), null);
  assert.equal(absoluteUrl(null, APP), null);
});

test("notification email: subject, link, line breaks and escaping", async () => {
  const mail = await renderNotificationEmail({
    title: 'Price up: <script>alert("x")</script> & Co',
    body: "Was €10.99\nNow €11.99 <b>bold</b>",
    url: "/subscriptions?sub=spotify",
    appUrl: APP,
  });
  assert.equal(mail.subject, 'Price up: <script>alert("x")</script> & Co'); // subjects are plain text
  assert.ok(!mail.html.includes("<script>"), "title must be escaped in the HTML");
  assert.ok(!mail.html.includes("<b>bold</b>"));
  assert.ok(mail.html.includes("&lt;script&gt;"));
  assert.ok(mail.html.includes("&lt;b&gt;bold&lt;/b&gt;"));
  assert.ok(mail.html.includes('href="https://subs.example.com/subscriptions?sub=spotify"'));
  assert.ok(mail.html.includes("<br"));
  assert.match(mail.text, /Was €10\.99\nNow €11\.99/);
  assert.match(mail.text, /https:\/\/subs\.example\.com\/subscriptions\?sub=spotify/);
});

test("notification email without APP_URL has no broken relative links", async () => {
  const mail = await renderNotificationEmail({ title: "Hi", body: "Body", url: "/subscriptions" });
  assert.ok(!mail.html.includes('href="/subscriptions"'));
  assert.ok(!/Open Subscriptions/.test(mail.html));
});

const digest: DigestEmailProps = DigestEmail.PreviewProps;

test("digest email: summary block, renewals and events", async () => {
  const mail = await renderDigestEmail({
    ...digest,
    events: [
      {
        title: "New subscription: <img src=x onerror=alert(1)>",
        body: "€20.00 monthly",
        url: "/subscriptions",
        at: "2026-10-01T09:00:00Z",
      },
    ],
  });
  assert.equal(mail.subject, "Weekly summary: 1 update");
  assert.match(mail.text, /Net monthly cost: €84\.37 \/ month/); // table cells stay apart in plain text
  assert.match(mail.text, /Hostinger · 9 Oct 2026 · €47\.88/);
  for (const s of [mail.html, mail.text]) {
    assert.ok(s.includes("€84.37 / month"));
    assert.ok(s.includes("after €18.00 reimbursed"));
    assert.ok(s.includes("2 charges · €36.00"));
    assert.ok(s.includes("Hostinger"));
    assert.ok(s.includes("9 Oct 2026"));
  }
  assert.ok(!mail.html.includes("<img src=x"));
  assert.ok(mail.html.includes("&lt;img src=x onerror=alert(1)&gt;"));
});

test("an empty digest is still a useful email", async () => {
  const mail = await renderDigestEmail({
    frequency: "monthly",
    events: [],
    summary: { currency: "EUR", netMonthlyCost: 12, upcomingRenewals: [], outstandingReimbursements: { count: 0, amount: 0 } },
  });
  assert.equal(mail.subject, "Monthly summary: nothing new");
  assert.match(mail.text, /Nothing new this month/);
  assert.ok(!mail.text.includes("reimbursed")); // no "after €0 reimbursed"
});
