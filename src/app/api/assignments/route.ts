import type { InStatement } from "@libsql/client";
import { type NextRequest, NextResponse } from "next/server";
import { planAssignment } from "@/lib/server/assign";
import { all, getDb } from "@/lib/server/db";
import { detection, getAssignOptions } from "@/lib/server/queries";
import { guard } from "@/lib/server/session";

type Body = { subKey?: string | null; txIds?: unknown };

// GET /api/assignments?tx=<id> — what the "Add to subscription" dialog offers for one payment.
export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get("tx");
  if (!id) return NextResponse.json({ error: "Missing tx" }, { status: 400 });
  const options = await getAssignOptions(id);
  if (!options) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  return NextResponse.json(options);
}

// PUT /api/assignments { subKey: string | null, txIds: string[] }
// Puts payments into a subscription (null = start a new one). Returns the subscription key.
export async function PUT(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as Body;
  const txIds = Array.isArray(body.txIds) ? body.txIds.filter((id): id is string => typeof id === "string") : [];
  const subKey = typeof body.subKey === "string" && body.subKey ? body.subKey : null;

  const db = await getDb();
  const [{ txs, det }, overrides] = await Promise.all([detection(), all<{ key: string }>(db, "SELECT key FROM overrides")]);
  const plan = planAssignment(txs, det, new Set(overrides.map((o) => o.key)), subKey, txIds);
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });

  const writes: InStatement[] = [];
  for (let i = 0; i < plan.txIds.length; i += 200) {
    const chunk = plan.txIds.slice(i, i + 200);
    const marks = chunk.map(() => "?").join(",");
    // An assigned charge is no longer "removed" from anything.
    writes.push({ sql: `DELETE FROM tx_exclusions WHERE tx_id IN (${marks})`, args: chunk });
    writes.push({
      sql: `INSERT INTO tx_assignments (tx_id, sub_key) VALUES ${chunk.map(() => "(?, ?)").join(",")}
            ON CONFLICT(tx_id) DO UPDATE SET sub_key = excluded.sub_key`,
      args: chunk.flatMap((id) => [id, plan.key]),
    });
  }
  await db.batch(writes, "write");
  return NextResponse.json({ ok: true, key: plan.key });
}
