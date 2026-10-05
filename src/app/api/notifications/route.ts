import { NextResponse } from "next/server";
import { getNotificationFeed } from "@/lib/server/notifications/run";
import { guard } from "@/lib/server/session";

// The bell's feed: newest first, with the unread count (neither read nor resolved).
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json(await getNotificationFeed());
}
