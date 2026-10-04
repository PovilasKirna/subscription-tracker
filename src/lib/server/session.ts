import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./auth";

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/** Use at the top of every protected route handler: `const denied = await guard(); if (denied) return denied;` */
export async function guard(): Promise<NextResponse | null> {
  return (await isAuthenticated()) ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
