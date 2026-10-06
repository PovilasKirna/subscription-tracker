import type { InStatement } from "@libsql/client";
import { type NextRequest, NextResponse } from "next/server";
import { planSplit } from "@/lib/server/assign";
import { all, getDb, type Override, saveOverride } from "@/lib/server/db";
import { detection } from "@/lib/server/queries";
import { guard } from "@/lib/server/session";

// POST /api/subscriptions/split { key } — one subscription per price it's billed at.
// Each new part is named "<name> · <price>" and inherits the category, website, cadence and group.
export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { key?: unknown };
  if (typeof body.key !== "string" || !body.key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

  const db = await getDb();
  const [{ txs, det }, overrides] = await Promise.all([detection(), all<Override>(db, "SELECT * FROM overrides")]);
  const plan = planSplit(txs, det, new Set(overrides.map((o) => o.key)), body.key);
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });

  const writes: InStatement[] = plan.parts.flatMap((p) =>
    Array.from({ length: Math.ceil(p.txIds.length / 200) }, (_, i) => {
      const chunk = p.txIds.slice(i * 200, (i + 1) * 200);
      return {
        sql: `INSERT INTO tx_assignments (tx_id, sub_key) VALUES ${chunk.map(() => "(?, ?)").join(",")}
              ON CONFLICT(tx_id) DO UPDATE SET sub_key = excluded.sub_key`,
        args: chunk.flatMap((id) => [id, p.key]),
      };
    }),
  );
  await db.batch(writes, "write");

  const sub = det.subscriptions.find((s) => s.key === body.key);
  const from = overrides.find((o) => o.key === body.key);
  for (const p of plan.parts.filter((p) => p.isNew)) {
    await saveOverride(db, p.key, {
      display_name: `${sub?.name ?? ""} · ${(p.amountMinor / 100).toFixed(2)}`.trim(),
      category: from?.category ?? null,
      website: from?.website ?? null,
      cadence: from?.cadence ?? null,
      group_name: from?.group_name ?? null,
    });
  }
  return NextResponse.json({ ok: true, keys: plan.parts.map((p) => p.key) });
}
