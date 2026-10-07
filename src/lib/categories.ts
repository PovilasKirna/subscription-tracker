// Spending categories: where each transaction's money went (or came from). Shared by the server
// (categorisation, analytics) and the client (labels, pickers). Icons live in
// components/spending/CategoryIcon.tsx so this stays free of UI imports.

export const CATEGORY_IDS = [
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
  // Between your own accounts: neither spending nor income
  "internal",
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

/** spend: counts towards "Spent" · income: towards "Income" · internal: neither. */
export type CategoryKind = "spend" | "income" | "internal";

export const CATEGORIES: Record<CategoryId, { label: string; kind: CategoryKind; hint?: string }> = {
  groceries: { label: "Groceries", kind: "spend" },
  restaurants: { label: "Restaurants & cafés", kind: "spend" },
  transport: { label: "Transport", kind: "spend", hint: "Taxis, fuel, parking, public transport" },
  shopping: { label: "Shopping", kind: "spend" },
  subscriptions: { label: "Subscriptions", kind: "spend", hint: "Charges of a detected subscription" },
  entertainment: { label: "Entertainment", kind: "spend" },
  bills: { label: "Bills & utilities", kind: "spend", hint: "Phone, internet, energy, insurance" },
  housing: { label: "Housing", kind: "spend", hint: "Rent and home costs" },
  health: { label: "Health & fitness", kind: "spend" },
  travel: { label: "Travel", kind: "spend" },
  cash: { label: "Cash", kind: "spend", hint: "ATM withdrawals" },
  transfers: { label: "Transfers", kind: "spend", hint: "Money sent to other people" },
  fees: { label: "Fees", kind: "spend" },
  general: { label: "General", kind: "spend", hint: "Everything not categorised yet" },
  refunds: { label: "Refunds", kind: "spend", hint: "Money back on purchases; reduces spending" },
  salary: { label: "Salary", kind: "income" },
  income: { label: "Other income", kind: "income" },
  internal: { label: "Between my accounts", kind: "internal", hint: "Savings, pockets, exchanges, top-ups from my own cards" },
};

export const isCategoryId = (v: unknown): v is CategoryId => typeof v === "string" && (CATEGORY_IDS as readonly string[]).includes(v);
