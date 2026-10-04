import { type NextRequest, NextResponse } from "next/server";
import { checkPassword, createSessionToken, loginAllowed, SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/auth";
import { config } from "@/lib/server/config";

export async function POST(req: NextRequest) {
  if (!config.password) {
    return NextResponse.json({ error: "APP_PASSWORD is not set on the server." }, { status: 500 });
  }
  const client = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (!loginAllowed(client)) {
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !checkPassword(password)) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken(), sessionCookieOptions);
  return res;
}
