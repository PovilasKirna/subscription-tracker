import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SESSION_SECRET = "test-secret";
process.env.APP_PASSWORD = "correct horse battery staple";
const { checkPassword, createSessionToken, verifySessionToken } = await import("../lib/server/auth");

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
