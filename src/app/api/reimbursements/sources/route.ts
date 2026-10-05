import { type NextRequest, NextResponse } from "next/server";
import { getDb, insertSource, sourceNameTaken } from "@/lib/server/db";
import { getReimbursementSources } from "@/lib/server/queries";
import { parseSourceInput } from "@/lib/server/reimbursementInput";
import { guard } from "@/lib/server/session";

// Reimbursement sources: list them (with the subscriptions using each) or add one.

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json(await getReimbursementSources());
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const parsed = parseSourceInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const db = await getDb();
  if (await sourceNameTaken(db, parsed.value.name)) {
    return NextResponse.json({ error: `There's already a source called ${parsed.value.name}` }, { status: 409 });
  }
  return NextResponse.json({ id: await insertSource(db, parsed.value) });
}
