import { NextResponse } from "next/server";
import { mailStatus } from "@/lib/server/mail";
import { guard } from "@/lib/server/session";

// GET /api/mail — which email provider is configured and the sender address (never the secrets).
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json(mailStatus());
}
