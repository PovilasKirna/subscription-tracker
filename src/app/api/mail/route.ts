import { NextResponse } from "next/server";
import { mailSetup } from "@/lib/server/mail";
import { guard } from "@/lib/server/session";

// GET /api/mail — which email provider is configured, the sender address and where links in
// emails lead (never the secrets).
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json(mailSetup());
}
