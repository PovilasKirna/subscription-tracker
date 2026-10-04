import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { pushSetup } from "@/lib/server/push/send";
import {
  deletePushSubscriptions,
  listPushSubscriptions,
  parsePushSubscription,
  savePushSubscription,
  toDevice,
} from "@/lib/server/push/store";
import { guard } from "@/lib/server/session";
import type { PushDevicesPayload } from "@/lib/types";

// GET /api/push/subscriptions — devices that get push notifications, plus whether push is set up.
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const { configured, problem } = pushSetup();
  const devices = (await listPushSubscriptions(await getDb())).map(toDevice);
  return NextResponse.json({ configured, problem, devices } satisfies PushDevicesPayload);
}

// POST /api/push/subscriptions { subscription: PushSubscriptionJSON } — this browser wants notifications.
// The device name comes from the User-Agent ("Chrome on Windows", "iPhone").
export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  if (!pushSetup().configured) return NextResponse.json({ error: "Push notifications aren't set up on the server." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { subscription?: unknown };
  const target = parsePushSubscription(body.subscription);
  if (!target) return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  const device = await savePushSubscription(await getDb(), target, req.headers.get("user-agent"));
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
