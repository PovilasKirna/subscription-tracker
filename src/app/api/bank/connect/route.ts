import { type NextRequest, NextResponse } from "next/server";
import { bankErrorResponse } from "@/lib/server/bankErrors";
import { bankConfigured } from "@/lib/server/config";
import { getDb, run } from "@/lib/server/db";
import { listAspsps, startAuth } from "@/lib/server/enableBanking";
import { guard } from "@/lib/server/session";

// Starts the bank consent flow; the browser is sent to the bank, then back to /api/bank/callback.
export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (e) {
    return bankErrorResponse(e);
  }
}

async function handle(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  if (!bankConfigured()) return NextResponse.json({ error: "Enable Banking is not configured." }, { status: 400 });
  const { name, country } = (await req.json().catch(() => ({}))) as { name?: string; country?: string };
  if (!name || !country) return NextResponse.json({ error: "Pick a bank first." }, { status: 400 });

  const aspsp = (await listAspsps(country)).find((a) => a.name === name);
  if (!aspsp) return NextResponse.json({ error: `Bank "${name}" not found in ${country}.` }, { status: 404 });

  const { url, state } = await startAuth({ name: aspsp.name, country: aspsp.country }, aspsp.maximum_consent_validity);
  const db = await getDb();
  await run(db, "DELETE FROM pending_auth WHERE created_at < datetime('now', '-1 hour')");
  await run(db, "INSERT INTO pending_auth (state, aspsp_name, aspsp_country, required_psu_headers) VALUES (?, ?, ?, ?)", [
    state,
    aspsp.name,
    aspsp.country,
    JSON.stringify(aspsp.required_psu_headers ?? []),
  ]);
  return NextResponse.json({ url });
}
