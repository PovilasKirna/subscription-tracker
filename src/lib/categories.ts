import { isColorSlot } from "./color";

// Spending categories: where each transaction's money went (or came from). Shared by the server
// (categorisation, analytics) and the client (labels, pickers). Icons live in
// components/spending/CategoryIcon.tsx so this stays free of UI imports.
//
// Built-in categories have stable ids and are what automatic categorisation uses; the user can
// rename them, change their icon and colour, and hide most of them. Custom categories ("c_…" ids)
// are the user's own and only hold payments the user put there. Both live in the `categories`
// table (built-ins only once changed); see buildCategories.

export const BUILTIN_CATEGORY_IDS = [
  // Money out
  "groceries",
  "restaurants",
  "transport",
  "shopping",
  "subscriptions",
  "entertainment",
  "bills",
  "housing",
  "health",
  "travel",
  "cash",
  "transfers",
  "fees",
  "general",
  // Money back on earlier spending (counted against spending, not as income)
  "refunds",
  // Money in
  "salary",
  "income",
  // Put aside: neither spending nor income, shown as "Saved"
  "savings",
  // Between your own accounts: not counted at all
  "internal",
] as const;
export type BuiltinCategoryId = (typeof BUILTIN_CATEGORY_IDS)[number];
/** A built-in id, or a custom category's generated "c_…" id. */
export type CategoryId = string;

/**
 * spend: counts towards "Spent" · income: towards "Income" · savings: towards "Saved" (neither
 * spent nor earned) · internal: not counted at all.
 */
export const CATEGORY_KINDS = ["spend", "income", "savings", "internal"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const KIND_LABEL: Record<CategoryKind, string> = {
  spend: "Spending",
  income: "Income",
  savings: "Savings",
  internal: "Not counted",
};
export const KIND_HINT: Record<CategoryKind, string> = {
  spend: "Counts towards what you spent. Money back (refunds) is taken off.",
  income: "Counts towards your income.",
  savings: "Money put aside. Shown as saved, not as spending or income.",
  internal: "Left out of every total, like exchanges or moving money between your own accounts.",
};

/** The icons a category can have (lucide names; the components are mapped in CategoryIcon.tsx). */
export const CATEGORY_ICON_NAMES = [
  // Money
  "piggy-bank",
  "landmark",
  "wallet",
  "coins",
  "banknote",
  "credit-card",
  "hand-coins",
  "trending-up",
  "circle-dollar-sign",
  "briefcase",
  "receipt",
  "send",
  "arrow-left-right",
  "repeat",
  "undo",
  "siren",
  "umbrella",
  "shield",
  // Shopping and eating out
  "shopping-basket",
  "shopping-cart",
  "shopping-bag",
  "shirt",
  "gift",
  "tag",
  "utensils",
  "coffee",
  "beer",
  "wine",
  // Getting around
  "car",
  "bus",
  "train",
  "fuel",
  "bike",
  "plane",
  "tree-palm",
  // Home
  "home",
  "zap",
  "wifi",
  "smartphone",
  "laptop",
  "wrench",
  // Health and life
  "heart-pulse",
  "pill",
  "dumbbell",
  "scissors",
  "graduation-cap",
  "book-open",
  "baby",
  "paw-print",
  "hand-heart",
  "party-popper",
  "clapperboard",
  "music",
  "gamepad",
  "sparkles",
  "shapes",
] as const;
export type CategoryIconName = (typeof CATEGORY_ICON_NAMES)[number];
export const isCategoryIconName = (v: unknown): v is CategoryIconName =>
  typeof v === "string" && (CATEGORY_ICON_NAMES as readonly string[]).includes(v);

type BuiltinDefaults = { label: string; kind: CategoryKind; icon: CategoryIconName; color?: number; hint?: string };

export const BUILTIN_CATEGORIES: Record<BuiltinCategoryId, BuiltinDefaults> = {
  groceries: { label: "Groceries", kind: "spend", icon: "shopping-basket" },
  restaurants: { label: "Restaurants & cafés", kind: "spend", icon: "utensils" },
  transport: { label: "Transport", kind: "spend", icon: "car", hint: "Taxis, fuel, parking, public transport" },
  shopping: { label: "Shopping", kind: "spend", icon: "shopping-bag" },
  subscriptions: { label: "Subscriptions", kind: "spend", icon: "repeat", hint: "Charges of a detected subscription" },
  entertainment: { label: "Entertainment", kind: "spend", icon: "clapperboard" },
  bills: { label: "Bills & utilities", kind: "spend", icon: "zap", hint: "Phone, internet, energy, insurance" },
  housing: { label: "Housing", kind: "spend", icon: "home", hint: "Rent and home costs" },
  health: { label: "Health & fitness", kind: "spend", icon: "heart-pulse" },
  travel: { label: "Travel", kind: "spend", icon: "plane" },
  cash: { label: "Cash", kind: "spend", icon: "banknote", hint: "ATM withdrawals" },
  transfers: { label: "Transfers", kind: "spend", icon: "send", hint: "Money sent to other people" },
  fees: { label: "Fees", kind: "spend", icon: "receipt" },
  general: { label: "General", kind: "spend", icon: "shapes", hint: "Everything not categorised yet" },
  refunds: { label: "Refunds", kind: "spend", icon: "undo", hint: "Money back on purchases; reduces spending" },
  salary: { label: "Salary", kind: "income", icon: "briefcase", color: 1 },
  income: { label: "Other income", kind: "income", icon: "circle-dollar-sign", color: 3 },
  savings: { label: "Savings", kind: "savings", icon: "piggy-bank", color: 5, hint: "Savings accounts, vaults and pockets" },
  internal: { label: "Between my accounts", kind: "internal", icon: "arrow-left-right", hint: "Exchanges, top-ups from my own cards" },
};

export const isBuiltinCategoryId = (v: unknown): v is BuiltinCategoryId =>
  typeof v === "string" && (BUILTIN_CATEGORY_IDS as readonly string[]).includes(v);
export const isCustomCategoryId = (v: unknown): v is string => typeof v === "string" && /^c_[a-z0-9]{8}$/.test(v);

/**
 * Where the app puts payments it would file under a hidden built-in, by that category's kind. These
 * catch-alls can't be hidden themselves.
 */
export const HIDDEN_FALLBACK: Record<CategoryKind, BuiltinCategoryId> = {
  spend: "general",
  income: "income",
  savings: "internal",
  internal: "internal",
};
export const canHide = (id: CategoryId) => isBuiltinCategoryId(id) && !Object.values(HIDDEN_FALLBACK).includes(id);

/** "No colour" stored for a built-in that has one by default (null = the default). */
export const NO_CATEGORY_COLOR = 0;
export const MAX_CATEGORY_NAME = 40;

export type Category = {
  id: CategoryId;
  label: string;
  kind: CategoryKind;
  icon: CategoryIconName;
  /** Palette slot 1–8 (`--series-n`); null = neutral. */
  color: number | null;
  hint?: string;
  builtIn: boolean;
  /** Built-ins only: not offered when picking, and the app files its payments under HIDDEN_FALLBACK. */
  hidden: boolean;
};

/** A row of the `categories` table: a custom category, or the user's changes to a built-in. */
export type CategoryRow = {
  id: string;
  /** null = the built-in's own name. */
  label: string | null;
  /** Custom categories only (a built-in's kind is fixed). */
  kind: string | null;
  icon: string | null;
  /** Palette slot; NO_CATEGORY_COLOR = none; null = the built-in's default (none for a custom one). */
  color: number | null;
  hidden: number;
};

/** Every category: the built-ins (with the user's changes), then the custom ones in `rows` order. Pure. */
export function buildCategories(rows: readonly CategoryRow[]): Category[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const colorOf = (stored: number | null | undefined, fallback: number | null) =>
    stored === null || stored === undefined ? fallback : isColorSlot(stored) ? stored : null;
  const builtIns = BUILTIN_CATEGORY_IDS.map((id): Category => {
    const d = BUILTIN_CATEGORIES[id];
    const r = byId.get(id);
    return {
      id,
      label: r?.label?.trim() || d.label,
      kind: d.kind,
      icon: isCategoryIconName(r?.icon) ? r.icon : d.icon,
      color: colorOf(r?.color, d.color ?? null),
      ...(d.hint && { hint: d.hint }),
      builtIn: true,
      hidden: Boolean(r?.hidden) && canHide(id),
    };
  });
  const custom = rows
    .filter((r) => isCustomCategoryId(r.id) && r.label?.trim() && (CATEGORY_KINDS as readonly string[]).includes(r.kind ?? ""))
    .map(
      (r): Category => ({
        id: r.id,
        label: (r.label as string).trim(),
        kind: r.kind as CategoryKind,
        icon: isCategoryIconName(r.icon) ? r.icon : "shapes",
        color: colorOf(r.color, null),
        builtIn: false,
        hidden: false,
      }),
    );
  return [...builtIns, ...custom];
}

export type CategoryLookup = {
  list: readonly Category[];
  byId: ReadonlyMap<CategoryId, Category>;
  /** The category, or General for an id that no longer exists (e.g. one just deleted). */
  of: (id: CategoryId) => Category;
  /** Can payments be put in it (it exists and isn't hidden)? */
  selectable: (id: unknown) => id is CategoryId;
  /** `id`, or where its payments go while it's hidden. */
  visible: (id: CategoryId) => CategoryId;
};

export function categoryLookup(list: readonly Category[]): CategoryLookup {
  const byId = new Map(list.map((c) => [c.id, c]));
  const general = byId.get("general") ?? buildCategories([])[BUILTIN_CATEGORY_IDS.indexOf("general")];
  const of = (id: CategoryId) => byId.get(id) ?? general;
  return {
    list,
    byId,
    of,
    selectable: (id): id is CategoryId => typeof id === "string" && byId.has(id) && !of(id).hidden,
    visible: (id) => {
      const c = of(id);
      return c.hidden ? HIDDEN_FALLBACK[c.kind] : c.id;
    },
  };
}

/** The built-ins as shipped, for code (and tests) that runs without the user's categories. */
export const DEFAULT_CATEGORIES = categoryLookup(buildCategories([]));
