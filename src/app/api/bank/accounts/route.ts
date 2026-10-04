import { after, type NextRequest, NextResponse } from "next/server";
import { bankConfigured } from "@/lib/server/config";
import { getDb, one, run } from "@/lib/server/db";
import { psuFromRequest } from "@/lib/server/enableBanking";
import { guard } from "@/lib/server/session";
import { syncAfterCurrent } from "@/lib/server/sync";

// The per-account "Included" switch. Off: the account isn't fetched and its transactions are hidden
// everywhere (nothing is deleted). Back on: a sync runs right away so the gap is backfilled.
export const maxDuration = 300;

export async function PATCH(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const { key, included } = (await req.json().catch(() => ({}))) as { key?: unknown; included?: unknown };
  if (typeof key !== "string" || typeof included !== "boolean") {
    return NextResponse.json({ error: "Expected { key, included }" }, { status: 400 });
  }
  const db = await getDb();
  const account = await one<{ session_id: string; included: number; status: string | null }>(
    db,
    `SELECT a.session_id, a.included, s.status FROM bank_accounts a
       JOIN bank_sessions s ON s.session_id = a.session_id WHERE a.account_key = ?`,
    [key],
  );
  if (!account) return NextResponse.json({ error: "Account not found — it may have been disconnected." }, { status: 404 });
  await run(db, "UPDATE bank_accounts SET included = ? WHERE account_key = ?", [included ? 1 : 0, key]);

  const backfill = included && !account.included && bankConfigured() && account.status !== "needs_reconnect";
  if (backfill) {
    // The user is here, so PSU headers go along (no background quota). Marked as syncing up front
    // so the page shows it immediately; the run itself happens after the response.
    const psu = psuFromRequest(req.headers);
    await run(db, "UPDATE bank_sessions SET sync_started_at = ? WHERE session_id = ?", [new Date().toISOString(), account.session_id]);
    after(() =>
      syncAfterCurrent({ psu, sessionId: account.session_id }).catch((e) => console.error("[sync] backfill after re-include failed:", e)),
    );
  }
  return NextResponse.json({ ok: true, syncing: backfill });
}
