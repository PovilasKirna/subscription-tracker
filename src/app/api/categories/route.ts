import { type NextRequest, NextResponse } from "next/server";
import { isCategoryId } from "@/lib/categories";
import { getDb, one } from "@/lib/server/db";
import { guard } from "@/lib/server/session";

// Pick a payment's spending category. scope "merchant" applies it to every payment to/from the same
// merchant (and drops this payment's own choice so it follows the rule); "payment" to this one only.
// category null goes back to automatic for that scope.

type Body = { txId?: unknown; scope?: unknown; category?: unknown };

export async function PUT(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as Body;
  const scope = body.scope === "merchant" ? "merchant" : body.scope === "payment" ? "payment" : null;
  if (typeof body.txId !== "string" || !scope) return NextResponse.json({ error: "txId and scope are required" }, { status: 400 });
  if (body.category !== null && !isCategoryId(body.category)) return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  const db = await getDb();
  const tx = await one<{ merchant_key: string }>(db, "SELECT merchant_key FROM transactions WHERE id = ?", [body.txId]);
  if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  if (scope === "payment") {
    await db.execute(
      body.category === null
        ? { sql: "DELETE FROM tx_categories WHERE tx_id = ?", args: [body.txId] }
        : {
            sql: "INSERT INTO tx_categories (tx_id, category) VALUES (?, ?) ON CONFLICT(tx_id) DO UPDATE SET category = excluded.category",
            args: [body.txId, body.category],
          },
    );
  } else {
    await db.batch(
      [
        { sql: "DELETE FROM tx_categories WHERE tx_id = ?", args: [body.txId] },
        body.category === null
          ? { sql: "DELETE FROM category_rules WHERE merchant_key = ?", args: [tx.merchant_key] }
          : {
              sql: "INSERT INTO category_rules (merchant_key, category) VALUES (?, ?) ON CONFLICT(merchant_key) DO UPDATE SET category = excluded.category",
              args: [tx.merchant_key, body.category],
            },
      ],
      "write",
    );
  }
  return NextResponse.json({ ok: true });
}
