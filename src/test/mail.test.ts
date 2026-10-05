import assert from "node:assert/strict";
import { test } from "node:test";
import { getMailer, mailProvider, mailStatus, senderDomain } from "../lib/server/mail";
import { RESEND_ENDPOINT, ResendMailer } from "../lib/server/mail/resend";
import { SmtpMailer } from "../lib/server/mail/smtp";

const none = { resendApiKey: "", smtpUrl: "", from: "" };
const FROM = "Hoard <notifications@example.com>";

test("mailer selection: Resend first, then SMTP, else email is off", () => {
  assert.equal(mailProvider(none), null);
  assert.equal(mailProvider({ ...none, smtpUrl: "smtp://localhost:25" }), "smtp");
  assert.equal(mailProvider({ ...none, smtpUrl: "smtp://localhost:25", resendApiKey: "re_x" }), "resend");

  assert.equal(getMailer({ ...none, from: FROM }), null);
  assert.ok(getMailer({ ...none, resendApiKey: "re_x", smtpUrl: "smtp://localhost", from: FROM }) instanceof ResendMailer);
  assert.ok(getMailer({ ...none, smtpUrl: "smtp://localhost", from: FROM }) instanceof SmtpMailer);
  // A provider without a sender address can't send.
  assert.equal(getMailer({ ...none, resendApiKey: "re_x" }), null);
});

test("mail status explains what's missing", () => {
  assert.deepEqual(mailStatus(none), {
    provider: null,
    from: null,
    ready: false,
    problem: "Set RESEND_API_KEY (or SMTP_URL) to send email.",
  });
  assert.equal(mailStatus({ ...none, resendApiKey: "re_x" }).problem, "Set MAIL_FROM to the address emails are sent from.");
  assert.deepEqual(mailStatus({ ...none, resendApiKey: "re_x", from: FROM }), {
    provider: "resend",
    from: FROM,
    ready: true,
    problem: null,
  });
});

test("sender domain: taken from MAIL_FROM with or without a display name", () => {
  assert.equal(senderDomain(FROM), "example.com");
  assert.equal(senderDomain("onboarding@Resend.dev"), "resend.dev");
  assert.equal(senderDomain(" Hoard <a@mail.example.org> "), "mail.example.org");
  assert.equal(senderDomain(""), null);
  assert.equal(senderDomain("Hoard"), null);
});

test("Resend: one JSON POST with the API key, sender and both bodies", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
  }) as unknown as typeof fetch;
  await new ResendMailer("re_secret", FROM, fakeFetch).send({ to: "me@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, RESEND_ENDPOINT);
  assert.equal(calls[0].init.method, "POST");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer re_secret");
  assert.equal(headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    from: FROM,
    to: ["me@example.com"],
    subject: "Hi",
    html: "<p>Hi</p>",
    text: "Hi",
  });
});

test("Resend errors surface the API's message", async () => {
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ statusCode: 403, name: "validation_error", message: "The example.com domain is not verified." }), {
      status: 403,
    })) as unknown as typeof fetch;
  await assert.rejects(
    new ResendMailer("re_secret", FROM, fakeFetch).send({ to: "me@example.com", subject: "Hi", html: "", text: "" }),
    /403.*domain is not verified/,
  );
});
