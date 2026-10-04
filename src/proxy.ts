import { type NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions, sessionNeedsRenewal, verifySessionToken } from "@/lib/server/auth";

// Gate everything behind the login. Route handlers and the app layout re-check too.
const PUBLIC = [
  "/login",
  "/api/auth/login",
  "/api/bank/callback",
  "/api/health",
  "/api/cron/sync",
  "/privacy",
  "/terms",
  // Fetched by the browser/OS without our cookie: installing to the home screen, the push service worker.
  "/manifest.webmanifest",
  "/sw.js",
];
const PUBLIC_PREFIXES = ["/icons/"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (verifySessionToken(token)) {
    const res = NextResponse.next();
    // Sliding session; logout sets its own (deleting) cookie, so leave that response alone.
    if (pathname !== "/api/auth/logout" && sessionNeedsRenewal(token)) {
      res.cookies.set(SESSION_COOKIE, createSessionToken(), sessionCookieOptions);
    }
    return res;
  }
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL("/login", req.url);
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
