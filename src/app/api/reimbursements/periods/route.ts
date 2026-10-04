import { type NextRequest, NextResponse } from "next/server";
import { getDb, insertSource, one, run, sourceNameTaken } from "@/lib/server/db";
import { detection } from "@/lib/server/queries";
import { DEFAULT_SOURCE, parsePeriodInput } from "@/lib/server/reimbursementInput";
import { guard } from "@/lib/server/session";

// Start a reimbursement period for a subscription from a chosen date: set up, change the amount
// or source, or stop reimbursing (`stop: true`). A period starting on the same day replaces it.

export async function PUT(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const today = new Date().toISOString().slice(0, 10);
  const parsed = parsePeriodInput(await req.json().catch(() => null), today);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { subKey, startsOn, source, amountMinor } = parsed.value;
  // Only detected (not ignored) subscriptions, so no period is left where nothing can remove it.
  if (!(await detection()).det.subscriptions.some((s) => s.key === subKey)) {
    return NextResponse.json({ error: "That subscription isn't detected anymore" }, { status: 404 });
  }
  const db = await getDb();

  let sourceId: number | null = null;
  if (source.kind === "existing") {
    if (!(await one(db, "SELECT 1 AS x FROM reimbursement_sources WHERE id = ?", [source.id]))) {
      return NextResponse.json({ error: "That reimbursement source no longer exists" }, { status: 400 });
    }
    sourceId = source.id;
  } else if (source.kind === "new") {
    if (await sourceNameTaken(db, source.input.name)) {
      return NextResponse.json({ error: `There's already a source called ${source.input.name}` }, { status: 409 });
    }
    sourceId = await insertSource(db, source.input);
  } else if (source.kind === "default") {
    // Nothing picked: the default "Salary" source, created the first time it's needed.
    const existing = await one<{ id: number }>(db, "SELECT id FROM reimbursement_sources WHERE lower(name) = lower(?) ORDER BY id", [
      DEFAULT_SOURCE.name,
    ]);
    sourceId = existing ? Number(existing.id) : await insertSource(db, DEFAULT_SOURCE);
  }

  await run(
    db,
    `INSERT INTO reimbursement_periods (sub_key, source_id, amount_minor, starts_on) VALUES (?, ?, ?, ?)
     ON CONFLICT(sub_key, starts_on) DO UPDATE SET source_id = excluded.source_id, amount_minor = excluded.amount_minor`,
    [subKey, sourceId, amountMinor, startsOn],
  );
  return NextResponse.json({ ok: true, sourceId });
}
