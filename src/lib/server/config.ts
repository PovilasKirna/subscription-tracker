import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Next.js loads .env / .env.local into process.env for us.
const env = process.env;
// turbopackIgnore: runtime paths — keeps the build from tracing (and shipping) data/ and the whole repo.
const dataDir = resolve(/*turbopackIgnore: true*/ env.DATA_DIR || "./data");
/** Serverless (Vercel): read-only filesystem, so secrets and the DB must come from env. */
const serverless = Boolean(env.VERCEL);

let ensured = false;
function ensureDataDir() {
  if (!ensured && !serverless) mkdirSync(dataDir, { recursive: true });
  ensured = true;
}

let cachedSecret: string | undefined;
// Persist an auto-generated cookie secret so sessions survive restarts (self-hosted only).
function sessionSecret(): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (serverless) throw new Error("SESSION_SECRET must be set when running on Vercel.");
  if (cachedSecret) return cachedSecret;
  ensureDataDir();
  const file = join(dataDir, ".session-secret");
  if (existsSync(file)) cachedSecret = readFileSync(file, "utf8").trim();
  else {
    cachedSecret = randomBytes(32).toString("hex");
    writeFileSync(file, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}

function databaseUrl(): string {
  // TURSO_* are the names Vercel's Turso integration injects.
  const url = env.DATABASE_URL || env.TURSO_DATABASE_URL;
  if (url) return url;
  if (serverless) throw new Error("Set DATABASE_URL (or TURSO_DATABASE_URL) — Vercel has no persistent disk.");
  ensureDataDir();
  return `file:${join(dataDir, "tracker.db").replace(/\\/g, "/")}`;
}

export const config = {
  dataDir,
  serverless,
  get databaseUrl() {
    return databaseUrl();
  },
  databaseAuthToken: env.DATABASE_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || undefined,
  password: env.APP_PASSWORD || "",
  get sessionSecret() {
    return sessionSecret();
  },
  cookieSecure: env.COOKIE_SECURE === "true" || serverless,
  baseCurrency: (env.BASE_CURRENCY || "EUR").toUpperCase(),
  enableBanking: {
    appId: env.ENABLE_BANKING_APP_ID || "",
    /** PEM contents (for platforms without files); takes precedence over keyPath. */
    privateKey: env.ENABLE_BANKING_PRIVATE_KEY?.replace(/\\n/g, "\n") || "",
    keyPath: resolve(/*turbopackIgnore: true*/ env.ENABLE_BANKING_KEY_PATH || join(dataDir, "enablebanking.pem")),
    redirectUrl: env.ENABLE_BANKING_REDIRECT_URL || "https://localhost:3000/api/bank/callback",
    // Only overridden to point at the local mock (`npm run mock:bank`) during development.
    apiUrl: (env.ENABLE_BANKING_API_URL || "https://api.enablebanking.com").replace(/\/$/, ""),
  },
  syncIntervalHours: Number(env.SYNC_INTERVAL_HOURS ?? 12),
  /** Shared secret Vercel Cron sends as `Authorization: Bearer …`. */
  cronSecret: env.CRON_SECRET || "",
};

export function bankConfigured(): boolean {
  const eb = config.enableBanking;
  return Boolean(eb.appId) && (Boolean(eb.privateKey) || existsSync(eb.keyPath));
}
