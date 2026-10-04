import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { pushDevices, pushSetup } from "@/lib/server/push/send";
import { deletePushSubscriptions, parsePushSubscription, savePushSubscription } from "@/lib/server/push/store";
import { guard } from "@/lib/server/session";

// GET /api/push/subscriptions — devices that get push notifications, plus whether push is set up.
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json(await pushDevices(await getDb()));
}

// POST /api/push/subscriptions { subscription: PushSubscriptionJSON, replaces?: endpoint } — this browser
// wants notifications. The device name comes from the User-Agent ("Chrome on Windows", "iPhone").
// `replaces` is the endpoint this subscription supersedes (sent by the service worker on
// `pushsubscriptionchange`, or after re-subscribing with new VAPID keys); its row is dropped.
export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  if (!pushSetup().configured) return NextResponse.json({ error: "Push notifications aren't set up on the server." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { subscription?: unknown; replaces?: unknown };
  const target = parsePushSubscription(body.subscription);
  if (!target) return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  const replaces = typeof body.replaces === "string" ? body.replaces : null;
  const device = await savePushSubscription(await getDb(), target, req.headers.get("user-agent"), replaces);
  return NextResponse.json(device);
}

// DELETE /api/push/subscriptions { endpoint } — stop notifying a device.
export async function DELETE(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: unknown };
  if (typeof endpoint !== "string" || !endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  await deletePushSubscriptions(await getDb(), [endpoint]);
  return NextResponse.json({ ok: true });
}
