import { type NextRequest, NextResponse } from "next/server";
import { loadOverviewParams } from "@/lib/search-params";
import { getHistory } from "@/lib/server/queries";
import { guard } from "@/lib/server/session";

export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const { range } = loadOverviewParams(req.nextUrl.searchParams);
  return NextResponse.json(await getHistory(range));
}
