import { type NextRequest, NextResponse } from "next/server";
import { pushSetup, sendPush } from "@/lib/server/push/send";
import { guard } from "@/lib/server/session";

// POST /api/push/test { endpoint?: string } — a test notification to one device (or all of them).
export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const setup = pushSetup();
  if (!setup.configured) return NextResponse.json({ error: setup.problem }, { status: 503 });
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: unknown };
  const result = await sendPush(
    { title: "Test notification", body: "Push notifications work on this device.", url: "/", tag: "test" },
    typeof endpoint === "string" && endpoint ? { endpoints: [endpoint] } : {},
  );
  if (!result.sent) {
    const error = result.removed
      ? "This device's subscription has expired. Enable notifications on it again."
      : (result.failed[0] ?? "No devices to send to.");
    return NextResponse.json({ error, ...result }, { status: result.failed.length ? 502 : 404 });
  }
  return NextResponse.json(result);
}
