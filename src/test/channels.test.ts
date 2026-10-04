import assert from "node:assert/strict";
import { test } from "node:test";
import type { Mailer, MailMessage } from "../lib/server/mail";
import type { EmailContent } from "../lib/server/mail/templates";
import { type EmailRenderers, emailChannel, type OutgoingNotification, pushChannel } from "../lib/server/notifications/channels";
import type { DigestInput } from "../lib/server/notifications/plan";
import type { PushPayload, PushSendSummary } from "../lib/server/push/send";
import { DEFAULT_SETTINGS, type Settings } from "../lib/settings";

const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over });

const note = (over: Partial<OutgoingNotification> = {}): OutgoingNotification => ({
  id: 7,
  type: "price_increase",
  title: "Netflix costs more",
  body: "€12.99 → €15.99 a month",
  url: "/subscriptions?sub=netflix",
  tag: "price:netflix:2026-10-01",
  createdAt: "2026-10-04T09:00:00.000Z",
  ...over,
});

const digest: DigestInput = {
  frequency: "weekly",
  events: [],
  summary: { currency: "EUR", netMonthlyCost: 42, upcomingRenewals: [], outstandingReimbursements: { count: 0, amount: 0 } },
  timeZone: "UTC",
};

function fakePush(result: Partial<PushSendSummary> = {}) {
  const sent: PushPayload[] = [];
  return {
    sent,
    send: async (payload: PushPayload): Promise<PushSendSummary> => {
      sent.push(payload);
      return { sent: 1, removed: 0, failed: [], ...result };
    },
  };
}

test("push channel: ready only with VAPID keys and a subscribed device", () => {
  const { send } = fakePush();
  assert.equal(pushChannel({ configured: true, devices: 2, send }).ready(settings()), true);
  assert.equal(pushChannel({ configured: true, devices: 0, send }).ready(settings()), false);
  assert.equal(pushChannel({ configured: false, devices: 2, send }).ready(settings()), false);
  assert.equal(pushChannel({ configured: true, devices: 1, send }).kind, "push");
  assert.equal(pushChannel({ configured: true, devices: 1, send }).sendDigest, undefined); // push is immediate only
});

test("push channel: maps the notification to the service worker's payload", async () => {
  const push = fakePush();
  const channel = pushChannel({ configured: true, devices: 1, send: push.send });
  await channel.send(note(), settings());
  await channel.send(note({ url: null }), settings());
  assert.deepEqual(push.sent, [
    { title: "Netflix costs more", body: "€12.99 → €15.99 a month", url: "/subscriptions?sub=netflix", tag: "price:netflix:2026-10-01" },
    { title: "Netflix costs more", body: "€12.99 → €15.99 a month", url: "/", tag: "price:netflix:2026-10-01" },
  ]);
});

test("push channel: throws (so the run retries) only when no device got it and the push service failed", async () => {
  const send = (result: Partial<PushSendSummary>) =>
    pushChannel({ configured: true, devices: 2, send: fakePush(result).send }).send(note(), settings());
  await assert.rejects(send({ sent: 0, failed: ["503 Service Unavailable"] }), /Push failed: 503 Service Unavailable/);
  await send({ sent: 1, failed: ["503 Service Unavailable"] }); // one device has it: a retry would repeat it there
  await send({ sent: 0, removed: 2 }); // every device unsubscribed: nothing left to retry
});

function fakeMail() {
  const sent: MailMessage[] = [];
  const rendered: { kind: "notification" | "digest"; props: unknown }[] = [];
  const mailer: Mailer = {
    send: async (m) => {
      sent.push(m);
    },
  };
  const content = (subject: string): EmailContent => ({ subject, html: `<p>${subject}</p>`, text: subject });
  const render: EmailRenderers = {
    notification: async (props) => {
      rendered.push({ kind: "notification", props });
      return content(props.title);
    },
    digest: async (props) => {
      rendered.push({ kind: "digest", props });
      return content(`${props.frequency} digest`);
    },
  };
  return { sent, rendered, mailer, render };
}

test("email channel: ready only with a mailer and a saved recipient", () => {
  const { mailer, render } = fakeMail();
  const withRecipient = settings({ emailRecipient: "me@example.com" });
  assert.equal(emailChannel({ mailer, appUrl: "", render }).ready(withRecipient), true);
  assert.equal(emailChannel({ mailer, appUrl: "", render }).ready(settings()), false);
  assert.equal(emailChannel({ mailer: null, appUrl: "", render }).ready(withRecipient), false);
});

test("email channel: one email per notification to the saved recipient, links against APP_URL", async () => {
  const mail = fakeMail();
  const channel = emailChannel({ mailer: mail.mailer, appUrl: "https://subs.example.com", render: mail.render });
  await channel.send(note(), settings({ emailRecipient: "me@example.com" }));
  assert.deepEqual(mail.rendered, [
    {
      kind: "notification",
      props: {
        title: "Netflix costs more",
        body: "€12.99 → €15.99 a month",
        url: "/subscriptions?sub=netflix",
        appUrl: "https://subs.example.com",
      },
    },
  ]);
  assert.deepEqual(mail.sent, [
    { to: "me@example.com", subject: "Netflix costs more", html: "<p>Netflix costs more</p>", text: "Netflix costs more" },
  ]);
});

test("email channel: the digest goes out in the user's time zone", async () => {
  const mail = fakeMail();
  const channel = emailChannel({ mailer: mail.mailer, appUrl: "", render: mail.render });
  assert.ok(channel.sendDigest);
  await channel.sendDigest(digest, settings({ emailRecipient: "me@example.com", timeZone: "Europe/Vilnius" }));
  assert.deepEqual(mail.rendered, [{ kind: "digest", props: { ...digest, timeZone: "Europe/Vilnius", appUrl: "" } }]);
  assert.equal(mail.sent[0].to, "me@example.com");
  assert.equal(mail.sent[0].subject, "weekly digest");
});

test("email channel: refuses to send without a recipient or mailer instead of dropping it", async () => {
  const mail = fakeMail();
  await assert.rejects(emailChannel({ mailer: mail.mailer, appUrl: "", render: mail.render }).send(note(), settings()), /isn't set up/);
  await assert.rejects(
    emailChannel({ mailer: null, appUrl: "", render: mail.render }).send(note(), settings({ emailRecipient: "me@example.com" })),
    /isn't set up/,
  );
  assert.equal(mail.sent.length, 0);
  assert.equal(mail.rendered.length, 0);
});

test("email channel: a provider error propagates, so the runner gives the delivery back", async () => {
  const { render } = fakeMail();
  const failing: Mailer = {
    send: async () => {
      throw new Error("Resend rejected the email (403): The domain is not verified");
    },
  };
  await assert.rejects(
    emailChannel({ mailer: failing, appUrl: "", render }).send(note(), settings({ emailRecipient: "me@example.com" })),
    /domain is not verified/,
  );
});
