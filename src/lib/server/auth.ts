import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config";

// Single-user auth: one password from APP_PASSWORD, a signed expiring cookie.

export const SESSION_COOKIE = "st_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function sign(payload: string): string {
  return createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  // Hash first so lengths always match and timing does not leak length.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(candidate: string): boolean {
  if (!config.password) return false;
  return safeEqual(candidate, config.password);
}

export function createSessionToken(now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ exp: now + SESSION_MAX_AGE * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Expiry (ms epoch) of a genuine, unexpired session token; null when it is missing, forged or expired. */
export function sessionExpiry(token: string | undefined, now = Date.now()): number | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp: number };
    return typeof exp === "number" && exp > now ? exp : null;
  } catch {
    return null;
  }
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  return sessionExpiry(token, now) !== null;
}

/**
 * Sliding sessions: a valid cookie with fewer than this many days left is reissued for another
 * full 30 days, so an app installed to the home screen (opened now and then) never logs out.
 */
export const SESSION_RENEW_BELOW_DAYS = 20;

export function sessionNeedsRenewal(token: string | undefined, now = Date.now()): boolean {
  const exp = sessionExpiry(token, now);
  return exp !== null && exp - now < SESSION_RENEW_BELOW_DAYS * 86_400_000;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.cookieSecure,
  path: "/",
  maxAge: SESSION_MAX_AGE,
};

// Naive in-memory login throttle: 10 attempts per 15 minutes per client.
const attempts = new Map<string, { count: number; reset: number }>();
export function loginAllowed(clientId: string, now = Date.now()): boolean {
  const entry = attempts.get(clientId);
  if (!entry || entry.reset < now) {
    attempts.set(clientId, { count: 1, reset: now + 15 * 60 * 1000 });
    return true;
  }
  entry.count++;
  return entry.count <= 10;
}
