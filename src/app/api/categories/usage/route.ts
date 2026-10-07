import { NextResponse } from "next/server";
import { getCategoryUsage } from "@/lib/server/queries";
import { guard } from "@/lib/server/session";

// How many payments, merchant rules and single-payment choices each category has (Settings → Categories).
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json(await getCategoryUsage());
}
