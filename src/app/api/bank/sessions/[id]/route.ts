import { type NextRequest, NextResponse } from "next/server";
import { reconcileBankAccounts } from "@/lib/server/bankAccounts";
import { getDb, run } from "@/lib/server/db";
import { deleteSession } from "@/lib/server/enableBanking";
import { guard } from "@/lib/server/session";

// Disconnect a bank: revoke the consent at Enable Banking and forget the session locally.
// Already-imported transactions are kept; its account rows go, so any it hid become visible again.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  await deleteSession(id).catch(() => undefined); // consent may already be expired
  const db = await getDb();
  await run(db, "DELETE FROM bank_sessions WHERE session_id = ?", [id]);
  await reconcileBankAccounts(db);
  return NextResponse.json({ ok: true });
}
