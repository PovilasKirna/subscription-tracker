import { type NextRequest, NextResponse } from "next/server";
import { getDb, type OverrideStatus, run, saveOverride } from "@/lib/server/db";
import { COLOR_SLOTS } from "@/lib/server/detect";
import { guard } from "@/lib/server/session";
import type { Cadence } from "@/lib/types";

const STATUSES = new Set(["confirmed", "ignored", "cancelled"]);
const CADENCES = new Set<string>(["weekly", "monthly", "quarterly", "semiannual", "yearly"] satisfies Cadence[]);

type Body = {
  displayName?: string | null;
  category?: string | null;
  status?: string | null;
  colorSlot?: number | null;
  cadence?: string | null;
};

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { key } = await params;
  const body = (await req.json().catch(() => ({}))) as Body;
  if (body.status != null && !STATUSES.has(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (body.colorSlot != null && !(Number.isInteger(body.colorSlot) && body.colorSlot >= 1 && body.colorSlot <= COLOR_SLOTS)) {
    return NextResponse.json({ error: "Invalid colour" }, { status: 400 });
  }
  if (body.cadence != null && !CADENCES.has(body.cadence)) {
    return NextResponse.json({ error: "Invalid cadence" }, { status: 400 });
  }
  // Only the fields sent are written; omitted ones keep their stored value.
  await saveOverride(await getDb(), key, {
    display_name: body.displayName !== undefined ? body.displayName?.trim() || null : undefined,
    category: body.category !== undefined ? body.category || null : undefined,
    status: body.status as OverrideStatus | null | undefined,
    color_slot: body.colorSlot,
    cadence: body.cadence as Cadence | null | undefined,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { key } = await params;
  await run(await getDb(), "DELETE FROM overrides WHERE key = ?", [key]);
  return NextResponse.json({ ok: true });
}
