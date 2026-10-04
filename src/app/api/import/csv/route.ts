import { type NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/server/config";
import { getDb, insertTransactions, logImport } from "@/lib/server/db";
import { CsvFormatError, parseRevolutCsv } from "@/lib/server/revolutCsv";
import { guard } from "@/lib/server/session";

// Vercel rejects request bodies over ~4.5 MB; self-hosted can take more.
const MAX_BYTES = (config.serverless ? 4 : 25) * 1024 * 1024;
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const text = await req.text();
  if (text.length > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB) — export a shorter period and import it in parts.` },
      { status: 413 },
    );
  }
  try {
    const { rows, skipped } = parseRevolutCsv(text);
    const db = await getDb();
    const stats = await insertTransactions(db, rows);
    stats.skipped += skipped;
    const name = req.headers.get("x-file-name")?.slice(0, 120);
    await logImport(db, "csv", stats, name ?? undefined);
    return NextResponse.json(stats);
  } catch (e) {
    if (e instanceof CsvFormatError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
