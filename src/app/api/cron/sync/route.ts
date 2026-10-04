import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/server/config";
import { syncAll } from "@/lib/server/sync";

// Scheduled sync for serverless hosting (Vercel Cron, see vercel.json). Vercel sends
// `Authorization: Bearer $CRON_SECRET`. Self-hosted installs use the in-process scheduler.
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  if (!config.cronSecret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${config.cronSecret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await syncAll({ background: true, minIntervalHours: Math.max(6, config.syncIntervalHours) });
  return NextResponse.json(result);
}
