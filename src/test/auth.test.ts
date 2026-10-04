import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SESSION_SECRET = "test-secret";
process.env.APP_PASSWORD = "correct horse battery staple";
const { checkPassword, createSessionToken, sessionNeedsRenewal, verifySessionToken } = await import("../lib/server/auth");

test("password check", () => {
  assert.equal(checkPassword("correct horse battery staple"), true);
  assert.equal(checkPassword("wrong"), false);
});

test("session tokens verify, expire and resist tampering", () => {
  const now = Date.now();
  const token = createSessionToken(now);
  assert.equal(verifySessionToken(token, now), true);
  assert.equal(verifySessionToken(token, now + 31 * 86_400_000), false);
  const [payload, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ exp: now + 10 ** 12 })).toString("base64url");
  assert.equal(verifySessionToken(`${forged}.${sig}`, now), false);
  assert.equal(verifySessionToken(`${payload}.${sig}x`, now), false);
  assert.equal(verifySessionToken(undefined, now), false);
});

test("sliding sessions: renew once fewer than 20 of the 30 days remain", () => {
  const day = 86_400_000;
  const issued = Date.UTC(2026, 9, 1);
  const token = createSessionToken(issued);
  assert.equal(sessionNeedsRenewal(token, issued), false);
  assert.equal(sessionNeedsRenewal(token, issued + 9 * day), false); // 21 days left
  assert.equal(sessionNeedsRenewal(token, issued + 11 * day), true); // 19 days left
  assert.equal(sessionNeedsRenewal(token, issued + 31 * day), false); // expired: log in again instead
  assert.equal(sessionNeedsRenewal(`${token}x`, issued + 11 * day), false); // tampered
  assert.equal(sessionNeedsRenewal(undefined, issued), false);
  // The renewed cookie is good for another full 30 days.
  assert.equal(verifySessionToken(createSessionToken(issued + 11 * day), issued + 40 * day), true);
});
