import { type NextRequest, NextResponse } from "next/server";
import { getHoldingDetail } from "@/lib/server/queries";
import { guard } from "@/lib/server/session";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const detail = await getHoldingDetail(decodeURIComponent(id));
  if (!detail) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return NextResponse.json(detail);
}
