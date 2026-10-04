import { NextResponse } from "next/server";
import { pushSetup } from "@/lib/server/push/send";
import { guard } from "@/lib/server/session";

// GET /api/push/key — the VAPID public key browsers subscribe with (null until push is set up).
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const setup = pushSetup();
  return NextResponse.json({ publicKey: setup.configured ? setup.vapid.publicKey : null });
}
