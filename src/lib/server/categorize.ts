import { CATEGORIES, type CategoryId } from "../categories";
import type { TxRow } from "./db";

// Puts every transaction in a spending category. In order of precedence:
//   1. the user's choice for this payment, 2. the user's rule for its merchant,
//   3. money moving between the user's own accounts (savings, pockets, exchanges, card top-ups),
//   4. the transaction type (ATM, fee, refund, incoming money), 5. a detected subscription,
//   6. well-known merchant names, 7. the card network's merchant category code (bank sync only;
//   it's often generic, e.g. "digital goods" for a supermarket's app payment), 8. transfers out,
//   9. "general". Pure.

export type CategoryRules = {
  /** Transaction id → category the user picked for that one payment. */
  byTx: ReadonlyMap<string, CategoryId>;
  /** Merchant key → category the user picked for every payment to/from it. */
  byMerchant: ReadonlyMap<string, CategoryId>;
};

/** ISO 18245 merchant category codes → category (ranges inclusive). */
const MCC_RANGES: [number, number, CategoryId][] = [
  [3000, 3350, "travel"], // airlines
  [3351, 3500, "transport"], // car rental
  [3501, 3999, "travel"], // hotels
  [4011, 4131, "transport"],
  [4411, 4411, "travel"], // cruise lines
  [4457, 4468, "transport"],
  [4511, 4582, "travel"],
  [4722, 4723, "travel"],
  [4784, 4789, "transport"],
  [4812, 4816, "bills"],
  [4821, 4900, "bills"],
  [5122, 5122, "health"],
  [5200, 5399, "shopping"],
  [5411, 5411, "groceries"],
  [5422, 5462, "groceries"],
  [5499, 5499, "groceries"],
  [5511, 5599, "transport"],
  [5541, 5542, "transport"],
  [5172, 5172, "transport"],
  [5600, 5799, "shopping"],
  [5811, 5814, "restaurants"],
  [5815, 5818, "entertainment"], // digital goods: media, games, apps
  [5900, 5911, "shopping"],
  [5912, 5912, "health"],
  [5913, 5999, "shopping"],
  [6010, 6011, "cash"],
  [6513, 6513, "housing"],
  [6300, 6399, "bills"], // insurance
  [7011, 7012, "travel"],
  [7512, 7523, "transport"],
  [7832, 7841, "entertainment"],
  [7911, 7996, "entertainment"],
  [7997, 7997, "health"], // clubs, gyms
  [7998, 7999, "entertainment"],
  [8011, 8099, "health"],
  [9311, 9399, "bills"], // taxes, government
];

function mccCategory(mcc: string | null | undefined): CategoryId | null {
  const n = Number(mcc);
  if (!mcc || !Number.isInteger(n)) return null;
  // Narrow ranges are listed after the broad ones they sit in, so the last match wins.
  let found: CategoryId | null = null;
  for (const [lo, hi, c] of MCC_RANGES) if (n >= lo && n <= hi) found = c;
  return found;
}

/** Merchant name patterns (matched against the merchant key and description, lowercased). */
const KEYWORDS: [RegExp, CategoryId][] = [
  [/bolt[ -]?food|wolt|glovo|foodora|uber[ -]?eats|deliveroo|just ?eat/, "restaurants"],
  [
    /\b(maxima|rimi|iki|norfa|lidl|aldi|aibe|silas|prisma|tesco|sainsbury|asda|carrefour|kaufland|biedronka|spar|auchan|edeka|rewe|billa|coop|selver|food ?market)\b|iki-express|rimi-hyper/,
    "groceries",
  ],
  [
    /caf[eé]|coffee|kavin|espresso|restoran|restaurant|pizz|burger|hesburger|mcdonald|kfc|subway|vapiano|sushi|kebab|bistro|\bbar\b|\bpub\b|bakery|kepykl|starbucks|costa|huracan/,
    "restaurants",
  ],
  [
    /\bbolt\b|uber|taxi|circle ?k|orlen|neste|viada|emsi|lukoil|\bshell\b|parking|parkav|stov[eė]jim|trafi|citybee|spark|\bltg\b|vvt|transport|fuel|degalin|\bbp\b/,
    "transport",
  ],
  [
    /ryanair|wizz|airbaltic|lufthansa|easyjet|\bklm\b|booking\.com|airbnb|hotel|hostel|expedia|flixbus|lux ?express|trip\.com|skyscanner/,
    "travel",
  ],
  [
    /amazon|pigu|senukai|ikea|varle|zara|\bh ?& ?m\b|ebay|aliexpress|temu|shein|decathlon|topo ?centras|elektromarkt|mediamarkt|\bdepo\b|jysk|euronics|apple ?store|lindex|reserved|sportland/,
    "shopping",
  ],
  [
    /apotheka|eurovaist|gintarin|\bbenu\b|camelia|pharm|vaistin|clinic|klinik|\bdent|odont|medic|\bgym\b|sport ?club|lemon[ -]?gym/,
    "health",
  ],
  [
    /telia|tele2|\bbite\b|ignitis|enefit|elektrum|vandenys|energij|internet|insurance|draudim|\bergo\b|gjensidige|lietuvos ?dujos|sodra|vmi/,
    "bills",
  ],
  [/\brent\b|rent-landlord|\bnuoma|landlord|b[uū]stas|bendrij|administrav/, "housing"],
  [
    /steam|playstation|xbox|nintendo|cinema|kino|forum ?cinemas|ticket|bilietai|bilietu|patreon|twitch|epic ?games|spotify|netflix/,
    "entertainment",
  ],
];

const INTERNAL =
  /^(to|from|į|iš)\b.*\b(savings?|vault|pocket|taupym|kaupim)|savings vault|exchanged? to|^top-?up by|^top up by|(apple|google) ?pay top-?up|^transfer to own|^own account/;
const INTEREST = /interest|palūkan/;

/** Payers who sent money in at least this many different months are taken to be an employer. */
const SALARY_MONTHS = 3;
const SALARY_MIN_MINOR = 300_00;

/** Merchants (payers) whose incoming payments look like salary: regular and sizeable. */
export function salaryPayers(txs: readonly TxRow[]): Set<string> {
  const byPayer = new Map<string, { months: Set<string>; amounts: number[] }>();
  for (const t of txs) {
    if (t.amount_minor <= 0 || (t.type !== "TOPUP" && t.type !== "TRANSFER" && t.type !== null)) continue;
    if (INTERNAL.test(t.description.toLowerCase())) continue;
    const p = byPayer.get(t.merchant_key) ?? { months: new Set(), amounts: [] };
    p.months.add(t.date.slice(0, 7));
    p.amounts.push(t.amount_minor);
    byPayer.set(t.merchant_key, p);
  }
  const out = new Set<string>();
  for (const [key, p] of byPayer) {
    const sorted = [...p.amounts].sort((a, b) => a - b);
    if (p.months.size >= SALARY_MONTHS && sorted[Math.floor(sorted.length / 2)] >= SALARY_MIN_MINOR) out.add(key);
  }
  return out;
}

export type AutoContext = { inSubscription: boolean; salary: ReadonlySet<string> };

/** The category the app picks by itself (steps 3–9 above). */
export function autoCategory(t: TxRow, ctx: AutoContext): CategoryId {
  const text = `${t.merchant_key} ${t.description}`.toLowerCase();
  const incoming = t.amount_minor > 0;
  if (t.type === "EXCHANGE" || INTERNAL.test(t.description.toLowerCase())) return "internal";
  if (INTEREST.test(text) && incoming) return "income";
  // Revolut statements list vault movements on a "Savings" product row.
  if (t.source === "csv" && t.account && /savings|deposit/i.test(t.account)) return "internal";
  if (t.type === "ATM") return "cash";
  if (t.type === "FEE") return "fees";
  if (t.type === "CARD_REFUND" || t.type === "REFUND") return "refunds";
  if (incoming) {
    if (t.type === "CARD_PAYMENT") return "refunds"; // a reversed card payment
    return ctx.salary.has(t.merchant_key) ? "salary" : "income";
  }
  if (ctx.inSubscription) return "subscriptions";
  for (const [re, c] of KEYWORDS) if (re.test(text)) return c;
  const byMcc = mccCategory(t.mcc);
  if (byMcc) return byMcc;
  if (t.type === "TRANSFER") return "transfers";
  return "general";
}

/**
 * Category of every transaction. A user rule can't turn money in into spending or the other way
 * round by accident: an incoming payment ruled into a spending category counts as a refund of it.
 */
export function categorizeAll(txs: readonly TxRow[], txToSub: ReadonlyMap<string, string>, rules: CategoryRules): Map<string, CategoryId> {
  const salary = salaryPayers(txs);
  const out = new Map<string, CategoryId>();
  for (const t of txs) {
    const chosen = rules.byTx.get(t.id) ?? rules.byMerchant.get(t.merchant_key);
    out.set(t.id, chosen ?? autoCategory(t, { inSubscription: txToSub.has(t.id), salary }));
  }
  return out;
}

/** How a payment in `category` counts: +amount spent, +amount earned, or nothing. Minor units, positive. */
export function flowOf(t: Pick<TxRow, "amount_minor">, category: CategoryId): { spent: number; earned: number } {
  const kind = CATEGORIES[category].kind;
  if (kind === "internal") return { spent: 0, earned: 0 };
  if (kind === "income") return { spent: 0, earned: t.amount_minor };
  // Spending categories: money out adds, money back (refunds) subtracts.
  return { spent: -t.amount_minor, earned: 0 };
}

/** The category fields of a TransactionItem. */
export function categoryFields(
  t: Pick<TxRow, "id" | "merchant_key">,
  categoryOf: ReadonlyMap<string, CategoryId>,
  rules: CategoryRules,
): { category: CategoryId; categoryChosen: "payment" | "merchant" | null } {
  return {
    category: categoryOf.get(t.id) ?? "general",
    categoryChosen: rules.byTx.has(t.id) ? "payment" : rules.byMerchant.has(t.merchant_key) ? "merchant" : null,
  };
}
