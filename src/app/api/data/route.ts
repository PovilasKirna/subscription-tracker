import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { guard } from "@/lib/server/session";

// Wipes imported transactions, edits and the import log. Bank links are kept.
export async function DELETE() {
  const denied = await guard();
  if (denied) return denied;
  const db = await getDb();
  await db.batch(
    [
      "DELETE FROM transactions",
      "DELETE FROM overrides",
      "DELETE FROM tx_exclusions",
      "DELETE FROM tx_assignments",
      "DELETE FROM import_log",
      // Next sync re-fetches the full history the bank still allows.
      "UPDATE bank_sessions SET last_sync_at = NULL",
    ],
    "write",
  );
  return NextResponse.json({ ok: true });
}
