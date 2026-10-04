import { after, type NextRequest, NextResponse } from "next/server";
import { psuFromRequest } from "@/lib/server/enableBanking";
import { runNotificationsQuietly } from "@/lib/server/notifications/run";
import { guard } from "@/lib/server/session";
import { syncAll } from "@/lib/server/sync";

// "Sync now": the user is present, so PSU headers go along and the bank's
// background-fetch limit (typically 4/day) doesn't apply.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const result = await syncAll({ psu: psuFromRequest(req.headers) });
  after(() => runNotificationsQuietly("after sync")); // new charges may be pending, late or pricier
  return NextResponse.json(result);
}
