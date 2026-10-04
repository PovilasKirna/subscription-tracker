import { type NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/server/cronAuth";
import { minSyncIntervalHours, syncAll } from "@/lib/server/sync";

// Bank sync only, kept for existing cron jobs; /api/cron/tick does this and notifications too.
// Vercel sends `Authorization: Bearer $CRON_SECRET`. Self-hosted installs use the in-process scheduler.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req.headers)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await syncAll({ background: true, minIntervalHours: minSyncIntervalHours() });
  return NextResponse.json(result);
}
