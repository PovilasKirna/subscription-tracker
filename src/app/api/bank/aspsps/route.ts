import { type NextRequest, NextResponse } from "next/server";
import { bankErrorResponse } from "@/lib/server/bankErrors";
import { bankConfigured } from "@/lib/server/config";
import { listAspsps } from "@/lib/server/enableBanking";
import { guard } from "@/lib/server/session";

export async function GET(req: NextRequest) {
  try {
    return await handle(req);
  } catch (e) {
    return bankErrorResponse(e);
  }
}

async function handle(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  if (!bankConfigured()) return NextResponse.json({ error: "Enable Banking is not configured." }, { status: 400 });
  const country = (req.nextUrl.searchParams.get("country") || "LT").toUpperCase().slice(0, 2);
  const aspsps = await listAspsps(country);
  return NextResponse.json(
    aspsps.map((a) => ({ name: a.name, country: a.country, maximumConsentValidity: a.maximum_consent_validity ?? null })),
  );
}
