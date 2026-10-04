import { after, type NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/server/cronAuth";
import { tick } from "@/lib/server/notifications/tick";

// The scheduler's heartbeat: call hourly (cron-job.org on Vercel's free plan; Vercel Cron daily as a
// fallback) with `Authorization: Bearer $CRON_SECRET`. Syncs banks that are due (spaced out, so
// hourly calls don't use up the bank's quota), then plans and delivers notifications.
// Answers at once and works after the response, so a cron service's short timeout never cuts a sync
// off; `?wait=1` waits and returns the outcome instead (handy when testing by hand).
export const maxDuration = 300;

async function handle(req: NextRequest) {
  if (!cronAuthorized(req.headers)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (req.nextUrl.searchParams.get("wait") === "1") return NextResponse.json(await tick("http"));
  after(() => tick("http").then(() => undefined));
  return NextResponse.json({ ok: true, queued: true }, { status: 202 });
}

export const GET = handle;
export const POST = handle;
