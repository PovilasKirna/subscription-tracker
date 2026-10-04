import { type NextRequest, NextResponse } from "next/server";
import { psuFromRequest } from "@/lib/server/enableBanking";
import { guard } from "@/lib/server/session";
import { syncAll } from "@/lib/server/sync";

// "Sync now": the user is present, so PSU headers go along and the bank's
// background-fetch limit (typically 4/day) doesn't apply.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json(await syncAll({ psu: psuFromRequest(req.headers) }));
}
