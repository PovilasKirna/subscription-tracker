import { timingSafeEqual } from "node:crypto";
import { config } from "./config";

/**
 * Scheduled endpoints (/api/cron/*) are called by Vercel Cron or cron-job.org with
 * `Authorization: Bearer $CRON_SECRET`; compared in constant time. Without a secret they stay shut.
 */
export function cronAuthorized(headers: Headers, secret = config.cronSecret): boolean {
  if (!secret) return false;
  const got = Buffer.from(headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
