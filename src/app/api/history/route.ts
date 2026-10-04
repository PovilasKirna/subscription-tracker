import { type NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/server/queries";
import { guard } from "@/lib/server/session";

export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const months = Number(req.nextUrl.searchParams.get("months") ?? 12);
  return NextResponse.json(await getHistory(Number.isFinite(months) ? months : 12));
}
