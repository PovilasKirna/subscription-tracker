import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildCategories, type CategoryRow, categoryLookup, DEFAULT_CATEGORIES } from "../lib/categories";
import { type CategoryRules, categorizeAll, categoryFields, usableRules } from "../lib/server/categorize";
import { nameTaken, parseCategoryInput } from "../lib/server/categoryInput";
import {
  allCategories,
  allCategoryRules,
  dataVersions,
  deleteCategory,
  insertTransactions,
  openDb,
  run,
  saveCategory,
  type TxRow,
} from "../lib/server/db";
import { buildSpending } from "../lib/server/spending";

let n = 0;
const tx = (date: string, amount: number, description: string, extra: Partial<TxRow> = {}): TxRow => ({
  id: `c${++n}`,
  source: "csv",
  account: "Current",
  date,
  amount_minor: Math.round(amount * 100),
  currency: "EUR",
  description,
  merchant_key: description.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  type: amount < 0 ? "CARD_PAYMENT" : "TOPUP",
  state: "COMPLETED",
  ...extra,
});
const row = (r: Partial<CategoryRow> & { id: string }): CategoryRow => ({
  label: null,
  kind: null,
  icon: null,
  color: null,
  hidden: 0,
  ...r,
});

// ---------- the category list ----------

test("built-ins take the user's name, icon, colour and hiding; custom ones follow, invalid rows are ignored", () => {
  const list = buildCategories([
    row({ id: "groceries", label: "Food", icon: "coffee", color: 2 }),
    row({ id: "transfers", hidden: 1 }),
    row({ id: "general", hidden: 1 }), // a catch-all can't be hidden
    row({ id: "salary", color: 0 }), // no colour, instead of its default
    row({ id: "c_abcd1234", label: "Emergency fund", kind: "savings", icon: "siren", color: 8 }),
    row({ id: "c_bad", label: "Bad id", kind: "spend" }),
    row({ id: "c_nokind00", label: "No kind" }),
    row({ id: "c_noicon00", label: "Pets", kind: "spend", icon: "not-an-icon" }),
  ]);
  const c = categoryLookup(list);
  assert.deepEqual(
    [c.of("groceries").label, c.of("groceries").icon, c.of("groceries").color, c.of("groceries").kind],
    ["Food", "coffee", 2, "spend"],
  );
  assert.equal(c.of("transfers").hidden, true);
  assert.equal(c.of("general").hidden, false);
  assert.equal(c.of("salary").color, null);
  assert.equal(c.of("income").color, 3, "the built-in default colour");
  assert.deepEqual(
    list.filter((x) => !x.builtIn).map((x) => [x.id, x.kind, x.icon]),
    [
      ["c_abcd1234", "savings", "siren"],
      ["c_noicon00", "spend", "shapes"],
    ],
  );
  assert.equal(c.of("c_gone0000").id, "general", "an unknown id reads as General");
  assert.equal(c.selectable("transfers"), false);
  assert.equal(c.selectable("c_abcd1234"), true);
  assert.equal(c.selectable("c_gone0000"), false);
  assert.equal(c.visible("transfers"), "general");
  assert.equal(c.visible("groceries"), "groceries");
});

test("a hidden built-in's payments go to the catch-all of its kind", () => {
  const c = categoryLookup(
    buildCategories([row({ id: "salary", hidden: 1 }), row({ id: "savings", hidden: 1 }), row({ id: "restaurants", hidden: 1 })]),
  );
  assert.equal(c.visible("salary"), "income");
  assert.equal(c.visible("savings"), "internal", "back to how vault moves were counted before Savings existed");
  assert.equal(c.visible("restaurants"), "general");
});

// ---------- categorising ----------

test("custom categories hold what the user put there; hidden built-ins pass theirs on", () => {
  const fund = tx("2026-09-01", -200, "To Emergency Fund 🚨", { type: "TRANSFER" });
  const friend = tx("2026-09-02", -40, "Jonas Jonaitis", { type: "TRANSFER" });
  const lunch = tx("2026-09-03", -12, "Hesburger");
  const vault = tx("2026-09-04", -100, "To EUR Savings", { type: "TRANSFER" });
  const txs = [fund, friend, lunch, vault];
  const categories = categoryLookup(
    buildCategories([
      row({ id: "c_fund0000", label: "Emergency fund", kind: "savings" }),
      row({ id: "transfers", hidden: 1 }),
      row({ id: "restaurants", hidden: 1 }),
    ]),
  );
  const raw: CategoryRules = {
    byTx: new Map([[lunch.id, "restaurants"]]), // the user's choice, for a category since hidden
    byMerchant: new Map([[fund.merchant_key, "c_fund0000"]]),
  };
  const rules = usableRules(raw, categories);
  const cats = categorizeAll(txs, new Map(), rules, categories);
  assert.equal(cats.get(fund.id), "c_fund0000");
  assert.equal(cats.get(friend.id), "general", "Transfers is hidden");
  assert.equal(cats.get(lunch.id), "general", "a choice for a hidden category waits until it's shown again");
  assert.equal(cats.get(vault.id), "savings", "the built-in Savings catches vaults without any setup");
  assert.equal(categoryFields(lunch, cats, rules).categoryChosen, null);
  assert.equal(categoryFields(fund, cats, rules).categoryChosen, "merchant");

  // Shown again: the choice applies again.
  const shown = categoryLookup(buildCategories([row({ id: "c_fund0000", label: "Emergency fund", kind: "savings" })]));
  assert.equal(categorizeAll(txs, new Map(), usableRules(raw, shown), shown).get(lunch.id), "restaurants");
  // Deleted (no longer in the list): its rule is dropped and the payment is categorised automatically.
  assert.equal(categorizeAll(txs, new Map(), usableRules(raw, DEFAULT_CATEGORIES)).get(fund.id), "transfers");
});

// ---------- savings on the Spending page ----------

test("savings show as Saved and stay out of Spent, Income and the cashflow", () => {
  const txs = [
    tx("2026-09-25", 2000, "Salary", { type: "TRANSFER" }),
    tx("2026-09-02", -50, "Lidl Vilnius"),
    tx("2026-09-26", -300, "To Emergency Fund 🚨", { type: "TRANSFER" }),
    tx("2026-09-27", -200, "To EUR Savings", { type: "TRANSFER" }),
    tx("2026-09-28", 80, "From EUR Savings", { type: "TRANSFER" }),
    tx("2026-08-26", -100, "To EUR Savings", { type: "TRANSFER" }),
  ];
  const categories = categoryLookup(buildCategories([row({ id: "c_fund0000", label: "Emergency fund", kind: "savings" })]));
  const rules = usableRules({ byTx: new Map(), byMerchant: new Map([["to-emergency-fund-", "c_fund0000"]]) }, categories);
  const categoryOf = categorizeAll(txs, new Map(), rules, categories);
  assert.equal(categoryOf.get(txs[2].id), "c_fund0000");
  const s = buildSpending({ txs, categoryOf, categories, subscriptions: [], base: "EUR", range: "1m", at: "2026-09", today: "2026-10-07" });
  assert.equal(s.spent, 50);
  assert.equal(s.income.total, 2000);
  assert.equal(s.cashflow, 1950);
  assert.equal(s.saved.total, 420, "300 + 200 put aside, 80 taken back out");
  assert.equal(s.saved.previous, 100);
  assert.deepEqual(
    s.saved.categories.map((c) => [c.id, c.amount, c.count]),
    [
      ["c_fund0000", 300, 1],
      ["savings", 120, 2],
    ],
  );
  assert.deepEqual(
    s.categories.map((c) => c.id),
    ["groceries"],
  );
});

// ---------- API input ----------

test("new and edited categories are validated", () => {
  const list = buildCategories([row({ id: "c_fund0000", label: "Emergency fund", kind: "savings" })]);
  const c = categoryLookup(list);
  const free = () => false;
  assert.deepEqual(parseCategoryInput({ name: " Pets ", kind: "spend", icon: "paw-print", color: 5 }, null, free), {
    ok: true,
    value: { label: "Pets", kind: "spend", icon: "paw-print", color: 5 },
  });
  assert.deepEqual(parseCategoryInput({ name: "Pets", kind: "spend" }, null, free), {
    ok: true,
    value: { label: "Pets", kind: "spend", icon: "shapes" },
  });
  assert.equal(parseCategoryInput({ name: "", kind: "spend" }, null, free).ok, false);
  assert.equal(parseCategoryInput({ name: "Pets", kind: "crypto" }, null, free).ok, false);
  assert.equal(parseCategoryInput({ name: "Pets", kind: "spend", icon: "rocket" }, null, free).ok, false);
  assert.equal(parseCategoryInput({ name: "Pets", kind: "spend", color: 9 }, null, free).ok, false);
  assert.equal(parseCategoryInput({ name: "emergency FUND", kind: "spend" }, null, nameTaken(list)).ok, false, "names are unique");
  assert.equal(parseCategoryInput({ name: "Emergency fund" }, c.of("c_fund0000"), nameTaken(list, "c_fund0000")).ok, true);

  // Built-ins: the default name, icon and colour are stored as null; the kind can't change.
  assert.deepEqual(parseCategoryInput({ name: "Groceries", icon: "shopping-basket", color: 0 }, c.of("groceries"), free), {
    ok: true,
    value: { label: null, icon: null, color: null },
  });
  assert.deepEqual(parseCategoryInput({ name: "", color: 3 }, c.of("salary"), free), { ok: true, value: { label: null, color: 3 } });
  assert.deepEqual(parseCategoryInput({ color: 1 }, c.of("salary"), free), { ok: true, value: { color: null } });
  assert.equal(parseCategoryInput({ kind: "income" }, c.of("groceries"), free).ok, false);
  assert.deepEqual(parseCategoryInput({ kind: "spend" }, c.of("groceries"), free), { ok: true, value: {} });
  assert.deepEqual(parseCategoryInput({ hidden: true }, c.of("transfers"), free), { ok: true, value: { hidden: true } });
  assert.equal(parseCategoryInput({ hidden: true }, c.of("general"), free).ok, false, "a catch-all can't be hidden");
  assert.equal(parseCategoryInput({ hidden: true }, c.of("c_fund0000"), free).ok, false, "custom ones are deleted instead");

  // Groceries renamed to Food, then a custom "Groceries": clearing Food's name would bring back a taken one.
  const renamed = buildCategories([
    row({ id: "groceries", label: "Food", kind: null }),
    row({ id: "c_groc0000", label: "Groceries", kind: "spend" }),
  ]);
  const r = categoryLookup(renamed);
  assert.equal(parseCategoryInput({ name: "" }, r.of("groceries"), nameTaken(renamed, "groceries")).ok, false);
  assert.equal(parseCategoryInput({ name: "Groceries" }, r.of("groceries"), nameTaken(renamed, "groceries")).ok, false);
});

// ---------- storage ----------

const dir = mkdtempSync(join(tmpdir(), "subtracker-categories-"));
const db = await openDb(`file:${join(dir, "c.db").replaceAll("\\", "/")}`);

test("categories are saved, bump the categories' version (not detection's), and deleting one sends its payments back to automatic", async () => {
  const fund = tx("2026-09-01", -200, "To Emergency Fund", { type: "TRANSFER" });
  const other = tx("2026-09-02", -15, "Lidl Vilnius");
  await insertTransactions(db, [fund, other]);

  const before = await dataVersions(db);
  await saveCategory(db, "c_fund0000", { label: "Emergency fund", kind: "savings", icon: "siren", color: 8 });
  const versions = await dataVersions(db);
  assert.notEqual(versions.categories, before.categories, "the categorisation refreshes after a category changes");
  assert.equal(versions.data, before.data, "without rerunning subscription detection");
  await saveCategory(db, "c_fund0000", { color: 3 }); // only the given fields change
  await saveCategory(db, "groceries", { label: "Food" });
  await run(db, "INSERT INTO category_rules (merchant_key, category) VALUES (?, 'c_fund0000')", [fund.merchant_key]);
  await run(db, "INSERT INTO tx_categories (tx_id, category) VALUES (?, 'c_fund0000')", [other.id]);
  await run(db, "INSERT INTO category_rules (merchant_key, category) VALUES ('someone-else', 'groceries')");

  const categories = categoryLookup(await allCategories(db));
  assert.deepEqual(
    [categories.of("c_fund0000").label, categories.of("c_fund0000").icon, categories.of("c_fund0000").color],
    ["Emergency fund", "siren", 3],
  );
  assert.equal(categories.of("groceries").label, "Food");
  let cats = categorizeAll([fund, other], new Map(), usableRules(await allCategoryRules(db), categories), categories);
  assert.equal(cats.get(fund.id), "c_fund0000");
  assert.equal(cats.get(other.id), "c_fund0000");

  await deleteCategory(db, "c_fund0000");
  const after = categoryLookup(await allCategories(db));
  assert.equal(after.byId.has("c_fund0000"), false);
  const rules = await allCategoryRules(db);
  assert.deepEqual([...rules.byMerchant], [["someone-else", "groceries"]], "only the deleted category's choices are removed");
  assert.equal(rules.byTx.size, 0);
  cats = categorizeAll([fund, other], new Map(), usableRules(rules, after), after);
  assert.equal(cats.get(fund.id), "transfers");
  assert.equal(cats.get(other.id), "groceries");
});
