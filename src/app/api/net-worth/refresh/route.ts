import { after, type NextRequest, NextResponse } from "next/server";
import { bankConfigured } from "@/lib/server/config";
import { psuFromRequest } from "@/lib/server/enableBanking";
import { syncTrading212 } from "@/lib/server/netWorth";
import { runNotificationsQuietly } from "@/lib/server/notifications/run";
import { guard } from "@/lib/server/session";
import { syncAll } from "@/lib/server/sync";

// "Refresh" on the Net worth page: a bank sync the user started (so balances are fetched even if
// one was already recorded today, and the bank's background limit doesn't apply) plus Trading 212.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const [bank] = await Promise.all([bankConfigured() ? syncAll({ psu: psuFromRequest(req.headers) }) : null, syncTrading212()]);
  if (bank) after(() => runNotificationsQuietly("after sync"));
  return NextResponse.json({ ok: true, errors: bank?.errors ?? [] });
}
