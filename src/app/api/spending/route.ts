import { type NextRequest, NextResponse } from "next/server";
import { loadSpendingParams } from "@/lib/search-params";
import { getSpending } from "@/lib/server/queries";
import { guard } from "@/lib/server/session";

export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const { range, at } = loadSpendingParams(req.nextUrl.searchParams);
  return NextResponse.json(await getSpending(range, at));
}
