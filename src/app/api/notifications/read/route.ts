import { type NextRequest, NextResponse } from "next/server";
import { markRead } from "@/lib/server/notifications/run";
import { guard } from "@/lib/server/session";

// POST { ids: number[] } marks those read; POST { all: true } marks everything read.
export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; all?: unknown };
  if (body.all === true) await markRead("all");
  else if (Array.isArray(body.ids) && body.ids.length <= 500 && body.ids.every((id) => Number.isInteger(id))) {
    await markRead(body.ids as number[]);
  } else return NextResponse.json({ error: "Expected { ids: number[] } or { all: true }" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
