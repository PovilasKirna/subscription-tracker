import { type NextRequest, NextResponse } from "next/server";
import { isColorChoice } from "@/lib/color";
import { colorColumns, getDb, type OverrideStatus, run, saveOverride } from "@/lib/server/db";
import { normalizeWebsite } from "@/lib/server/merchant";
import { guard } from "@/lib/server/session";
import type { Cadence } from "@/lib/types";

const STATUSES = new Set(["confirmed", "ignored", "cancelled"]);
const CADENCES = new Set<string>(["weekly", "monthly", "quarterly", "semiannual", "yearly"] satisfies Cadence[]);

type Body = {
  displayName?: string | null;
  category?: string | null;
  status?: string | null;
  color?: unknown;
  cadence?: string | null;
  website?: string | null;
  group?: string | null;
};

/** Longest group name accepted. */
const MAX_GROUP = 60;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { key } = await params;
  const body = (await req.json().catch(() => ({}))) as Body;
  if (body.status != null && !STATUSES.has(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const { color } = body;
  if (!(color == null || isColorChoice(color))) {
    return NextResponse.json({ error: "Invalid colour" }, { status: 400 });
  }
  if (body.cadence != null && !CADENCES.has(body.cadence)) {
    return NextResponse.json({ error: "Invalid cadence" }, { status: 400 });
  }
  if (body.website != null && typeof body.website !== "string") {
    return NextResponse.json({ error: "Invalid website" }, { status: 400 });
  }
  if (body.group != null && (typeof body.group !== "string" || body.group.trim().length > MAX_GROUP)) {
    return NextResponse.json({ error: "Invalid group name" }, { status: 400 });
  }
  // An empty website (or null) clears it, back to the built-in logo if any.
  const websiteInput = body.website?.trim() ?? "";
  const website = websiteInput ? normalizeWebsite(websiteInput) : null;
  if (websiteInput && !website) {
    return NextResponse.json({ error: "That doesn't look like a website address" }, { status: 400 });
  }
  // Only the fields sent are written; omitted ones keep their stored value.
  await saveOverride(await getDb(), key, {
    display_name: body.displayName !== undefined ? body.displayName?.trim() || null : undefined,
    category: body.category !== undefined ? body.category || null : undefined,
    status: body.status as OverrideStatus | null | undefined,
    ...(color !== undefined ? colorColumns(color) : {}),
    cadence: body.cadence as Cadence | null | undefined,
    website: body.website !== undefined ? website : undefined,
    group_name: body.group !== undefined ? body.group?.trim() || null : undefined,
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
