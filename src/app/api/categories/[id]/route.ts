import { type NextRequest, NextResponse } from "next/server";
import { nameTaken, parseCategoryInput } from "@/lib/server/categoryInput";
import { allCategories, deleteCategory, getDb, saveCategory } from "@/lib/server/db";
import { guard } from "@/lib/server/session";

// Change one category (PATCH: name, icon, colour; kind for custom ones; hidden for built-ins) or
// delete a custom one (DELETE: its payments go back to automatic categorisation).

async function find(params: Promise<{ id: string }>) {
  const db = await getDb();
  const categories = await allCategories(db);
  const id = (await params).id;
  return { db, categories, category: categories.find((c) => c.id === id) };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { db, categories, category } = await find(params);
  if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  const parsed = parseCategoryInput(await req.json().catch(() => null), category, nameTaken(categories, category.id));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  await saveCategory(db, category.id, parsed.value);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { db, category } = await find(params);
  if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  if (category.builtIn) return NextResponse.json({ error: "Built-in categories can be hidden, not deleted" }, { status: 400 });
  await deleteCategory(db, category.id);
  return NextResponse.json({ ok: true });
}
