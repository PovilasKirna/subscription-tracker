import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { guard } from "@/lib/server/session";
import { getSettings, saveSettings } from "@/lib/server/settings";
import { parseSettingsPatch } from "@/lib/settings";

// GET: every preference (defaults filled in). PUT: a partial update, e.g.
// { "deliveryHour": 8 } or { "notifications": { "price_increase": { "push": false } } }.

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json(await getSettings(await getDb()));
}

export async function PUT(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const parsed = parseSettingsPatch(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  return NextResponse.json(await saveSettings(await getDb(), parsed.patch));
}
