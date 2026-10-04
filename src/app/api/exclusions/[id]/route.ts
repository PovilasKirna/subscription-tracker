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
  await db.batch(
    [
      // A removed charge leaves the subscription it was assigned to, too.
      { sql: "DELETE FROM tx_assignments WHERE tx_id = ?", args: [id] },
      { sql: "INSERT OR IGNORE INTO tx_exclusions (tx_id) VALUES (?)", args: [id] },
    ],
    "write",
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  await run(await getDb(), "DELETE FROM tx_exclusions WHERE tx_id = ?", [id]);
  return NextResponse.json({ ok: true });
}
