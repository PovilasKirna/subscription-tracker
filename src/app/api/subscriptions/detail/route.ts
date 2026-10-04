import { type NextRequest, NextResponse } from "next/server";
import { getSubscriptionDetail } from "@/lib/server/queries";
import { guard } from "@/lib/server/session";

// GET /api/subscriptions/detail?key=<merchant|currency[|price]> — data for the detail drawer.
export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });
  return NextResponse.json(await getSubscriptionDetail(key));
}
