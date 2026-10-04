// Runs without the react-server condition (see the "test" script): rendering emails needs react-dom/server.
import assert from "node:assert/strict";
import { test } from "node:test";
import DigestEmail from "../emails/DigestEmail";
import { absoluteUrl, type DigestEmailProps, planName } from "../emails/types";
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
  assert.match(mail.text, /^Hostinger · 9 Oct · €47\.88$/m); // one renewal per line
  for (const s of [mail.html, mail.text]) {
    assert.ok(s.includes("€84.37 / month"));
    assert.ok(s.includes("after €18.00 reimbursed"));
    assert.ok(s.includes("2 charges · €36.00"));
    assert.ok(s.includes("Hostinger"));
    assert.ok(s.includes("9 Oct"));
  }
  assert.ok(!mail.html.includes("<img src=x"));
  assert.ok(mail.html.includes("&lt;img src=x onerror=alert(1)&gt;"));
});

test("an empty digest is still a useful email", async () => {
  const mail = await renderDigestEmail({
    frequency: "monthly",
    timeZone: "Europe/Vilnius",
    events: [],
    summary: { currency: "EUR", netMonthlyCost: 12, upcomingRenewals: [], outstandingReimbursements: { count: 0, amount: 0 } },
  });
  assert.equal(mail.subject, "Monthly summary: nothing new");
  assert.match(mail.text, /Nothing new this month/);
  assert.ok(!mail.text.includes("reimbursed")); // no "after €0 reimbursed"
});

test("digest event dates are on the user's calendar, not UTC's", async () => {
  // 21:30Z on 3 Oct is already 00:30 on 4 Oct in Vilnius (UTC+3 in summer).
  const event = { title: "Late-night event", body: "x", at: "2026-10-03T21:30:00Z" };
  const vilnius = await renderDigestEmail({ ...digest, timeZone: "Europe/Vilnius", events: [event] });
  assert.ok(vilnius.text.includes("4 Oct"));
  assert.ok(!vilnius.text.includes("3 Oct"));
  const utc = await renderDigestEmail({ ...digest, timeZone: "UTC", events: [event] });
  assert.ok(utc.text.includes("3 Oct"));
});

test("digest renewals heading matches the window the list covers", async () => {
  const weekly = await renderDigestEmail(digest);
  assert.match(weekly.html, /Coming up this week/);
  assert.match(weekly.text, /Coming up this week/);
  assert.ok(!/Renewing next/.test(weekly.html));
  const monthly = await renderDigestEmail({ ...digest, frequency: "monthly" });
  assert.match(monthly.html, /Coming up this month/);
});

test("digest renewals drop the plan's price suffix: the amount column shows it", async () => {
  assert.equal(planName("Apple (App Store) · 9.99"), "Apple (App Store)");
  assert.equal(planName("Netflix"), "Netflix");
  assert.equal(planName("Spotify · Family"), "Spotify · Family"); // only a trailing price
  const mail = await renderDigestEmail(digest); // PreviewProps include "Apple (App Store) · 9.99"
  assert.ok(!mail.html.includes("· 9.99"));
  assert.match(mail.text, /^Apple \(App Store\) · 9 Oct · €9\.99$/m);
});

test("digest renewals are one table with fixed date and amount columns, so rows line up", async () => {
  const mail = await renderDigestEmail(digest);
  const section = mail.html.slice(mail.html.indexOf("Coming up this week"), mail.html.indexOf("Since your last summary"));
  assert.equal(section.match(/<table/g)?.length, 1, "every renewal row in the same table");
  assert.equal(section.match(/<tr/g)?.length, digest.summary.upcomingRenewals.length);
  assert.match(section, /table-layout:fixed/);
  assert.equal(section.match(/<td[^>]*width="64"/g)?.length, digest.summary.upcomingRenewals.length);
  assert.equal(section.match(/<td align="right" width="80"/g)?.length, digest.summary.upcomingRenewals.length);
  const summary = mail.html.slice(mail.html.indexOf("Net monthly cost"), mail.html.indexOf("Coming up this week"));
  assert.equal(summary.match(/<table/g)?.length, 1, "the summary rows share one table too");
});
