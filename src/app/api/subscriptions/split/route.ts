import type { InStatement } from "@libsql/client";
import { type NextRequest, NextResponse } from "next/server";
import { planSplit } from "@/lib/server/assign";
import { all, getDb, type Override, overrideStatement } from "@/lib/server/db";
import { detection } from "@/lib/server/queries";
import { guard } from "@/lib/server/session";

// POST /api/subscriptions/split { key } — one subscription per price it's billed at.
// Each new part is named "<name> · <price>" and inherits the category, website, cadence and group.
// Everything is written in one batch, so a failure leaves the subscription as it was.
export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { key?: unknown };
  if (typeof body.key !== "string" || !body.key) return NextResponse.json({ error: "Missing key" }, { status: 400 });
  const key = body.key;

  const db = await getDb();
  const [{ txs, det }, overrides] = await Promise.all([detection(), all<Override>(db, "SELECT * FROM overrides")]);
  const plan = planSplit(txs, det, new Set(overrides.map((o) => o.key)), key);
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });

  const writes: InStatement[] = [];
  const chunks = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / 200) }, (_, i) => ids.slice(i * 200, (i + 1) * 200));
  // One-offs that fit no plan lose any pin to this subscription, or they'd rejoin it as its latest price.
  for (const chunk of chunks(plan.released)) {
    writes.push({
      sql: `DELETE FROM tx_assignments WHERE sub_key = ? AND tx_id IN (${chunk.map(() => "?").join(",")})`,
      args: [key, ...chunk],
    });
  }
  for (const p of plan.parts) {
    for (const chunk of chunks(p.txIds)) {
      writes.push({
        sql: `INSERT INTO tx_assignments (tx_id, sub_key) VALUES ${chunk.map(() => "(?, ?)").join(",")}
              ON CONFLICT(tx_id) DO UPDATE SET sub_key = excluded.sub_key`,
        args: chunk.flatMap((id) => [id, p.key]),
      });
    }
  }
  const sub = det.subscriptions.find((s) => s.key === key);
  const from = overrides.find((o) => o.key === key);
  for (const p of plan.parts.filter((p) => p.isNew)) {
    const statement = overrideStatement(p.key, {
      display_name: `${sub?.name ?? ""} · ${(p.amountMinor / 100).toFixed(2)}`.trim(),
      category: from?.category ?? null,
      website: from?.website ?? null,
      cadence: from?.cadence ?? null,
      group_name: from?.group_name ?? null,
    });
    if (statement) writes.push(statement);
  }
  await db.batch(writes, "write");
  return NextResponse.json({ ok: true, keys: plan.parts.map((p) => p.key) });
}
