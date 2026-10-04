import { NextResponse } from "next/server";
import { all, allTransactions, getDb } from "@/lib/server/db";
import { guard } from "@/lib/server/session";

// Full JSON backup of your data (transactions + your edits).
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const db = await getDb();
  const body = {
    exportedAt: new Date().toISOString(),
    transactions: await allTransactions(db),
    overrides: await all(db, "SELECT * FROM overrides"),
    exclusions: await all(db, "SELECT * FROM tx_exclusions"),
    assignments: await all(db, "SELECT * FROM tx_assignments"),
    reimbursementSources: await all(db, "SELECT * FROM reimbursement_sources"),
    reimbursementPeriods: await all(db, "SELECT * FROM reimbursement_periods"),
    reimbursements: await all(db, "SELECT * FROM reimbursements"),
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="subscription-tracker-${body.exportedAt.slice(0, 10)}.json"`,
    },
  });
}
