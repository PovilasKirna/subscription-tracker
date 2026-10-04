import { type NextRequest, NextResponse } from "next/server";
import { getDb, run } from "@/lib/server/db";
import { deleteSession } from "@/lib/server/enableBanking";
import { guard } from "@/lib/server/session";

// Disconnect a bank: revoke the consent at Enable Banking and forget the session locally.
// Already-imported transactions are kept.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  await deleteSession(id).catch(() => undefined); // consent may already be expired
  await run(await getDb(), "DELETE FROM bank_sessions WHERE session_id = ?", [id]);
  return NextResponse.json({ ok: true });
}
