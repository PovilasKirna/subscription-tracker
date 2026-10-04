import { NextResponse } from "next/server";
import { getSchedulerStatus } from "@/lib/server/notifications/tick";
import { guard } from "@/lib/server/session";

// Settings → Notifications → Scheduler: last tick, whether ticks look hourly, whether CRON_SECRET is set.
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json(await getSchedulerStatus());
}
