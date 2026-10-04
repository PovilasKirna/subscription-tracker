import { type NextRequest, NextResponse } from "next/server";
import { getDb, one, run } from "@/lib/server/db";
import { detection } from "@/lib/server/queries";
import { chargeTotalMinor } from "@/lib/server/reimburse";
import { toMinor } from "@/lib/server/reimbursementInput";
import { guard } from "@/lib/server/session";

// Record what came back for one charge (PUT { amount }, 0 = not reimbursed) or forget it (DELETE),
// handing the charge back to its reimbursement period.

export async function PUT(req: NextRequest, { params }: { params: Promise<{ txId: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { txId } = await params;
  const body = (await req.json().catch(() => ({}))) as { amount?: unknown };
  const db = await getDb();
  const row = await one<{ date: string; amount_minor: number }>(db, "SELECT date, amount_minor FROM transactions WHERE id = ?", [txId]);
  if (!row) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  const tx = { id: txId, date: String(row.date), amount_minor: Number(row.amount_minor) };
  if (tx.amount_minor >= 0) return NextResponse.json({ error: "Only outgoing payments can be reimbursed" }, { status: 400 });
  // Capped at the whole charge it stands for: a charge is all of its subscription's payments that
  // day (as reimbursement resolution counts it), so €18 + a €0.50 fee can get €18.50 back.
  const { txs, det } = await detection();
  const charged = chargeTotalMinor(tx, txs, det.txToSub);
  const amount = toMinor(body.amount, { allowZero: true });
  if (amount === null || amount > charged) {
    return NextResponse.json({ error: "The reimbursement must be between 0 and the amount charged" }, { status: 400 });
  }
  await run(
    db,
    "INSERT INTO reimbursements (tx_id, amount_minor) VALUES (?, ?) ON CONFLICT(tx_id) DO UPDATE SET amount_minor = excluded.amount_minor",
    [txId, amount],
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ txId: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { txId } = await params;
  await run(await getDb(), "DELETE FROM reimbursements WHERE tx_id = ?", [txId]);
  return NextResponse.json({ ok: true });
}
