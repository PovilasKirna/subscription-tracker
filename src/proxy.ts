import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/server/auth";

// Gate everything behind the login. Route handlers and the app layout re-check too.
const PUBLIC = ["/login", "/api/auth/login", "/api/bank/callback", "/api/health", "/api/cron/sync", "/api/cron/tick", "/privacy", "/terms"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p)) return NextResponse.next();
  if (verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL("/login", req.url);
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"],
};
