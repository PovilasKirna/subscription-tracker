import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { categoryLookup } from "@/lib/categories";
import { nameTaken, parseCategoryInput } from "@/lib/server/categoryInput";
import { allCategories, getDb, one, saveCategory } from "@/lib/server/db";
import { getCategories } from "@/lib/server/queries";
import { guard } from "@/lib/server/session";

// Spending categories: list them (GET), add a custom one (POST), or pick a payment's category (PUT).
// PUT scope "merchant" applies it to every payment to/from the same merchant (and drops this
// payment's own choice so it follows the rule); "payment" to this one only. category null goes back
// to automatic for that scope.

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json(await getCategories());
}

/** A fresh custom id: "c_" and 8 lowercase letters/digits (never a built-in id). */
const newCategoryId = () => `c_${[...randomBytes(8)].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("")}`;

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const db = await getDb();
  const categories = await allCategories(db);
  const parsed = parseCategoryInput(await req.json().catch(() => null), null, nameTaken(categories));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const id = newCategoryId();
  await saveCategory(db, id, parsed.value);
  return NextResponse.json({ id });
}

type Body = { txId?: unknown; scope?: unknown; category?: unknown };

export async function PUT(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as Body;
  const scope = body.scope === "merchant" ? "merchant" : body.scope === "payment" ? "payment" : null;
  if (typeof body.txId !== "string" || !scope) return NextResponse.json({ error: "txId and scope are required" }, { status: 400 });
  const db = await getDb();
  if (body.category !== null && !categoryLookup(await allCategories(db)).selectable(body.category)) {
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  }
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
