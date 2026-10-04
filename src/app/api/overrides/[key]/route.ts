import { type NextRequest, NextResponse } from "next/server";
import { getDb, one, run } from "@/lib/server/db";
import { COLOR_SLOTS } from "@/lib/server/detect";
import { guard } from "@/lib/server/session";

const STATUSES = new Set(["confirmed", "ignored", "cancelled"]);

type Body = { displayName?: string | null; category?: string | null; status?: string | null; colorSlot?: number | null };

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
  const db = await getDb();
  const current = await one<{ display_name: string | null; category: string | null; status: string | null; color_slot: number | null }>(
    db,
    "SELECT display_name, category, status, color_slot FROM overrides WHERE key = ?",
    [key],
  );
  const next = {
    display_name: body.displayName !== undefined ? body.displayName?.trim() || null : (current?.display_name ?? null),
    category: body.category !== undefined ? body.category || null : (current?.category ?? null),
    status: body.status !== undefined ? body.status : (current?.status ?? null),
    color_slot: body.colorSlot !== undefined ? body.colorSlot : (current?.color_slot ?? null),
  };
  await run(
    db,
    `INSERT INTO overrides (key, display_name, category, status, color_slot) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET display_name = excluded.display_name, category = excluded.category, status = excluded.status,
       color_slot = excluded.color_slot`,
    [key, next.display_name, next.category, next.status, next.color_slot],
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { key } = await params;
  await run(await getDb(), "DELETE FROM overrides WHERE key = ?", [key]);
  return NextResponse.json({ ok: true });
}
