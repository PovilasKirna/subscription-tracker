import { type NextRequest, NextResponse } from "next/server";
import { getDb, one, run, sourceNameTaken } from "@/lib/server/db";
import { getReimbursementSources } from "@/lib/server/queries";
import { parseSourceInput } from "@/lib/server/reimbursementInput";
import { guard } from "@/lib/server/session";

// Edit one reimbursement source (PUT) or delete it (DELETE, only while no period uses it).

const sourceId = async (params: Promise<{ id: string }>) => {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const id = await sourceId(params);
  const parsed = parseSourceInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const db = await getDb();
  if (id === null || !(await one(db, "SELECT 1 AS x FROM reimbursement_sources WHERE id = ?", [id]))) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }
  const { name, mode, reminderDay } = parsed.value;
  if (await sourceNameTaken(db, name, id)) {
    return NextResponse.json({ error: `There's already a source called ${name}` }, { status: 409 });
  }
  await run(db, "UPDATE reimbursement_sources SET name = ?, mode = ?, reminder_day = ? WHERE id = ?", [name, mode, reminderDay, id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const id = await sourceId(params);
  const source = id === null ? undefined : (await getReimbursementSources()).sources.find((s) => s.id === id);
  if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });
  // Periods keep their history, so a source anything ever used stays.
  if (source.subscriptions.length) {
    const names = source.subscriptions.map((s) => s.name).join(", ");
    return NextResponse.json({ error: `${source.name} is still used by ${names}` }, { status: 409 });
  }
  const db = await getDb();
  // Re-checked in the statement itself, in case a period was added since.
  await run(db, "DELETE FROM reimbursement_sources WHERE id = ? AND NOT EXISTS (SELECT 1 FROM reimbursement_periods WHERE source_id = ?)", [
    id,
    id,
  ]);
  if (await one(db, "SELECT 1 AS x FROM reimbursement_sources WHERE id = ?", [id])) {
    return NextResponse.json({ error: `${source.name} is now in use` }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
