import { type NextRequest, NextResponse } from "next/server";
import { getDb, one, run } from "@/lib/server/db";
import { guard } from "@/lib/server/session";

// Remove one reimbursement period (e.g. one set up by mistake); the previous period, if any,
// then runs on until the next one.

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const id = Number((await params).id);
  const db = await getDb();
  if (!Number.isInteger(id) || !(await one(db, "SELECT 1 AS x FROM reimbursement_periods WHERE id = ?", [id]))) {
    return NextResponse.json({ error: "Period not found" }, { status: 404 });
  }
  await run(db, "DELETE FROM reimbursement_periods WHERE id = ?", [id]);
  return NextResponse.json({ ok: true });
}
