import { after, type NextRequest, NextResponse } from "next/server";
import { reconcileBankAccounts } from "@/lib/server/bankAccounts";
import { all, getDb, one, run } from "@/lib/server/db";
import { createSession, deleteSession, psuFromRequest } from "@/lib/server/enableBanking";
import { runNotificationsQuietly } from "@/lib/server/notifications/run";
import { syncAll } from "@/lib/server/sync";

type Pending = { aspsp_name: string; aspsp_country: string; required_psu_headers: string | null };

// The first full-history sync runs after the redirect; give it room on serverless.
export const maxDuration = 300;

// The bank redirects here after consent. Authorised by the one-time `state` we issued,
// not by the session cookie (it is a cross-site navigation).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const back = (q: string) => NextResponse.redirect(new URL(`/settings/data?${q}`, req.nextUrl.origin));
  const state = sp.get("state");
  const code = sp.get("code");
  const error = sp.get("error_description") || sp.get("error");
  if (error) return back(`bank=error&reason=${encodeURIComponent(error)}`);
  if (!state || !code) return back("bank=error&reason=missing+code");

  const db = await getDb();
  const pending = await one<Pending>(
    db,
    "SELECT aspsp_name, aspsp_country, required_psu_headers FROM pending_auth WHERE state = ? AND created_at > datetime('now', '-1 hour')",
    [state],
  );
  await run(db, "DELETE FROM pending_auth WHERE state = ?", [state]);
  if (!pending) return back("bank=error&reason=expired+or+unknown+state");

  const psu = psuFromRequest(req.headers); // the user is here right now
  let sessionId: string;
  try {
    const s = await createSession(code, psu);
    sessionId = s.session_id;
    await run(
      db,
      `INSERT OR REPLACE INTO bank_sessions
         (session_id, aspsp_name, aspsp_country, valid_until, accounts_json, required_psu_headers, status, sync_started_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        s.session_id,
        pending.aspsp_name,
        pending.aspsp_country,
        s.access?.valid_until ?? null,
        JSON.stringify(s.accounts),
        pending.required_psu_headers,
        new Date().toISOString(), // show "Importing…" immediately in Settings → Data & sync
      ],
    );
  } catch (e) {
    return back(`bank=error&reason=${encodeURIComponent((e as Error).message.slice(0, 200))}`);
  }

  // A reconnect supersedes older sessions for the same bank. Account keys are stable across
  // sessions, so history already imported is matched, not duplicated.
  const old = await all<{ session_id: string }>(
    db,
    "SELECT session_id FROM bank_sessions WHERE aspsp_name = ? AND aspsp_country = ? AND session_id != ?",
    [pending.aspsp_name, pending.aspsp_country, sessionId],
  );
  for (const o of old) await run(db, "DELETE FROM bank_sessions WHERE session_id = ?", [o.session_id]);
  // Accounts move to the new session (keeping their Included switch); ones it no longer lists go.
  await reconcileBankAccounts(db);

  // Full history is typically only available shortly after consent, so fetch it now — with
  // PSU headers, since the user is present. `after` keeps serverless functions alive for it.
  after(async () => {
    await Promise.all(old.map((o) => deleteSession(o.session_id).catch(() => undefined)));
    await syncAll({ psu, sessionId }).catch((e) => console.error("[sync] first sync failed:", e));
    await runNotificationsQuietly("after connecting a bank"); // also resolves "reconnect" notifications
  });
  return back("bank=connected");
}
