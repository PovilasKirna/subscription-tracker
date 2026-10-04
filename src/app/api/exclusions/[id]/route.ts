import { type NextRequest, NextResponse } from "next/server";
import { getDb, one, run } from "@/lib/server/db";
import { guard } from "@/lib/server/session";

// Remove a single charge from subscription detection (PUT) or put it back (DELETE).

export async function PUT(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const db = await getDb();
  if (!(await one(db, "SELECT 1 AS x FROM transactions WHERE id = ?", [id]))) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }
  // Any assignment stays: the exclusion overrides it, and deleting the exclusion restores it.
  await run(db, "INSERT OR IGNORE INTO tx_exclusions (tx_id) VALUES (?)", [id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  await run(await getDb(), "DELETE FROM tx_exclusions WHERE tx_id = ?", [id]);
  return NextResponse.json({ ok: true });
}
