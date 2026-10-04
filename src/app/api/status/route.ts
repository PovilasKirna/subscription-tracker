import { NextResponse } from "next/server";
import { getDataStatus } from "@/lib/server/queries";
import { guard } from "@/lib/server/session";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json(await getDataStatus());
}
