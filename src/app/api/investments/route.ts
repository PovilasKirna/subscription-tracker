import { NextResponse } from "next/server";
import { getInvestments } from "@/lib/server/netWorth";
import { guard } from "@/lib/server/session";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json(await getInvestments());
}
