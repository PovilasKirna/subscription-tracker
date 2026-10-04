// Turn a JSON backup (Data & sync → "Export JSON backup") into an anonymized diagnostics report
// you can safely share when reporting detection problems. Runs entirely on your machine.
//
//   npm run anonymize -- path/to/subscription-tracker-YYYY-MM-DD.json [--alias-all]
//
// Writes anonymized-report.md (read this first) and anonymized-report.json next to the input.
// Nothing is printed except file paths and counts. Review the report before sharing it.
//
// What is protected:
//  - merchant / counterparty names → stable aliases (merchant-007, transfer-03). Well-known
//    subscription brands (Netflix, Spotify, …) keep their name unless --alias-all is given.
//  - descriptions → "shapes": words become ‹word›, digits 9, letters X (only payment-processor
//    prefixes like PAYPAL / GOOGLE are kept, because they matter for merchant matching).
//  - amounts → multiplied by a hidden random factor *per merchant*, so price changes and stability
//    survive but real amounts can't be recovered (not even from a known brand's list price).
//  - dates → shifted by one hidden random offset, so intervals and cadence survive.
//  - removed: transaction ids, account ids / IBANs, bank session data.
import { randomInt } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Override, TxRow } from "../src/lib/server/db";
import { detectSubscriptions, fitCadence, isSpend } from "../src/lib/server/detect";
import { isKnownSubscription, merchantCategory } from "../src/lib/server/merchant";

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("--"));
const aliasAll = args.includes("--alias-all");
if (!input) {
  console.error("Usage: npm run anonymize -- <export.json> [--alias-all]");
  process.exit(1);
}

const backup = JSON.parse(readFileSync(input, "utf8")) as { transactions: TxRow[]; overrides: Override[] };
const txs = backup.transactions;
const overrides = new Map(backup.overrides.map((o) => [o.key, o]));
const today = new Date().toISOString().slice(0, 10);

// ---------- hidden transforms (never written anywhere) ----------
const DAY = 86_400_000;
const shiftDays = randomInt(5, 40);
const shiftDate = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - shiftDays * DAY).toISOString().slice(0, 10);
const scaleByMerchant = new Map<string, number>();
const scaleFor = (merchantKey: string) => {
  const existing = scaleByMerchant.get(merchantKey);
  if (existing) return existing;
  const f = 0.6 + randomInt(0, 80) / 100; // 0.60–1.39
  scaleByMerchant.set(merchantKey, f);
  return f;
};

// ---------- aliases ----------
const TRANSFER_TYPES = new Set(["TRANSFER", "TOPUP"]);
const counts = new Map<string, number>();
for (const t of txs) counts.set(t.merchant_key, (counts.get(t.merchant_key) ?? 0) + 1);
const isTransferKey = new Map<string, boolean>();
for (const t of txs) if (t.type && TRANSFER_TYPES.has(t.type)) isTransferKey.set(t.merchant_key, true);

const aliases = new Map<string, string>();
let m = 0;
let tr = 0;
for (const [key] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  if (!aliasAll && isKnownSubscription(key) && !isTransferKey.get(key)) aliases.set(key, key);
  else if (isTransferKey.get(key)) aliases.set(key, `transfer-${String(++tr).padStart(2, "0")}`);
  else aliases.set(key, `merchant-${String(++m).padStart(3, "0")}`);
}
const alias = (key: string) => aliases.get(key) ?? "unknown";

const KEEP_TOKENS =
  /^(paypal|pp|sq|sumup|zettle|stripe|google|apple\.com\/bill|apple|amzn|amazon|klarna|paysera|payu|www|com|\*|-|\/|\.|,)$/i;
function shape(description: string): string {
  return description
    .split(/(\s+|\*)/)
    .map((tok) => {
      if (!tok.trim() || tok === "*") return tok;
      if (KEEP_TOKENS.test(tok)) return tok.toUpperCase();
      if (/\d/.test(tok)) return tok.replace(/\d/g, "9").replace(/[A-Za-z]/g, "X");
      return "‹word›";
    })
    .join("")
    .replace(/(‹word›\s*){2,}/g, "‹words› ");
}

// ---------- detection on the real data (locally), reported through aliases ----------
const det = detectSubscriptions(txs, overrides, today, "EUR");
const keyStatus = (key: string) => overrides.get(key)?.status ?? null;

type Charge = { date: string; amount: number };
const chargesOf = (merchantKey: string, list: { date: string; amount: number }[]): Charge[] =>
  list.slice(-8).map((c) => ({ date: shiftDate(c.date), amount: Math.round(c.amount * scaleFor(merchantKey) * 100) / 100 }));

const describe = (s: (typeof det.subscriptions)[number]) => ({
  merchant: alias(s.merchantKey),
  plan: s.key.split("|").length > 2 ? "one of several price points" : undefined,
  known: s.known,
  category: s.category,
  cadence: s.cadence,
  status: s.status,
  confidence: s.confidence,
  chargeCount: s.chargeCount,
  priceChanges: s.priceChanges.length,
  userAction: keyStatus(s.key),
  recentCharges: chargesOf(s.merchantKey, s.charges),
  descriptionShapes: [...new Set(txs.filter((t) => t.merchant_key === s.merchantKey).map((t) => shape(t.description)))].slice(0, 3),
});

// Recurring-looking merchants the detector did not report (possible misses).
const detectedKeys = new Set([...det.subscriptions, ...det.ignored].map((s) => s.merchantKey));
const groups = new Map<string, TxRow[]>();
for (const t of txs)
  if (isSpend(t) && !detectedKeys.has(t.merchant_key)) groups.set(t.merchant_key, [...(groups.get(t.merchant_key) ?? []), t]);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const candidates = [...groups.entries()]
  .filter(([, g]) => g.length >= 3)
  .map(([key, g]) => {
    const dates = [...new Set(g.map((t) => t.date))].sort();
    const intervals = dates.slice(1).map((d, i) => Math.round((Date.parse(d) - Date.parse(dates[i])) / DAY));
    const amounts = g.map((t) => t.amount_minor);
    const distinctAmounts = new Set(amounts).size;
    return {
      merchant: alias(key),
      known: isKnownSubscription(key),
      category: merchantCategory(key),
      charges: g.length,
      medianIntervalDays: median(intervals),
      intervals: intervals.slice(-12),
      cadenceFit: fitCadence(dates)?.cadence ?? null,
      distinctAmountsShare: Math.round((distinctAmounts / amounts.length) * 100) / 100,
      types: [...new Set(g.map((t) => t.type ?? "bank"))],
      descriptionShapes: [...new Set(g.map((t) => shape(t.description)))].slice(0, 3),
    };
  })
  // What a human would call recurring: a monthly-or-longer rhythm (bills may vary in amount),
  // or a weekly rhythm with mostly stable amounts. Leaves out everyday shopping.
  .filter((c) => {
    const monthlyish = (c.cadenceFit && c.cadenceFit !== "weekly") || (c.medianIntervalDays >= 25 && c.medianIntervalDays <= 35);
    return monthlyish || (c.cadenceFit === "weekly" && c.distinctAmountsShare <= 0.5);
  })
  .sort((a, b) => b.charges - a.charges)
  .slice(0, 40);

// Possible cross-source duplicates that were not merged (same amount, ±3 days, csv vs bank).
let possibleDuplicates = 0;
const bank = txs.filter((t) => t.source === "bank");
const csv = txs.filter((t) => t.source === "csv");
for (const b of bank) {
  if (csv.some((c) => c.amount_minor === b.amount_minor && Math.abs(Date.parse(c.date) - Date.parse(b.date)) <= 3 * DAY))
    possibleDuplicates++;
}

const tally = (xs: (string | null)[]) => Object.fromEntries([...new Set(xs)].map((x) => [x ?? "none", xs.filter((y) => y === x).length]));
const report = {
  about:
    "Anonymized diagnostics. Merchant names aliased (known brands kept unless --alias-all), descriptions reduced to shapes, amounts scaled per merchant and dates shifted by hidden random values.",
  overview: {
    transactions: txs.length,
    months: Math.round((Date.parse(txs.at(-1)?.date ?? today) - Date.parse(txs[0]?.date ?? today)) / DAY / 30.4),
    sources: tally(txs.map((t) => t.source)),
    types: tally(txs.map((t) => t.type)),
    currencies: tally(txs.map((t) => t.currency)),
    distinctMerchants: counts.size,
    possibleUnmergedCsvBankDuplicates: possibleDuplicates,
  },
  detected: det.subscriptions.map(describe),
  ignoredByYou_falsePositives: det.ignored.map(describe),
  confirmedByYou: det.subscriptions.filter((s) => s.confirmed).map((s) => alias(s.merchantKey)),
  undetectedRecurringLooking_possibleMisses: candidates,
};

// ---------- write ----------
const outDir = dirname(input);
const jsonPath = join(outDir, "anonymized-report.json");
const mdPath = join(outDir, "anonymized-report.md");
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const row = (cells: (string | number | null | undefined)[]) => `| ${cells.map((c) => String(c ?? "")).join(" | ")} |`;
const subTable = (list: ReturnType<typeof describe>[]) =>
  list.length
    ? [
        row(["merchant", "category", "cadence", "status", "conf", "charges", "price changes", "your action", "description shapes"]),
        row(Array(9).fill("---")),
        ...list.map((s) =>
          row([
            s.merchant + (s.plan ? " (plan)" : ""),
            s.category,
            s.cadence,
            s.status,
            s.confidence,
            s.chargeCount,
            s.priceChanges,
            s.userAction,
            s.descriptionShapes.join(" · "),
          ]),
        ),
      ].join("\n")
    : "_none_";
const md = `# Anonymized subscription-detection report

${report.about}

**Review everything below before sharing.** Delete any line you're not comfortable with.

## Overview
${row(["transactions", "months", "distinct merchants", "possible unmerged CSV↔bank duplicates"])}
${row(["---", "---", "---", "---"])}
${row([report.overview.transactions, report.overview.months, report.overview.distinctMerchants, report.overview.possibleUnmergedCsvBankDuplicates])}

Types: ${Object.entries(report.overview.types)
  .map(([k, v]) => `${k} ${v}`)
  .join(", ")} · Sources: ${Object.entries(report.overview.sources)
  .map(([k, v]) => `${k} ${v}`)
  .join(", ")} · Currencies: ${Object.keys(report.overview.currencies).join(", ")}

## Detected subscriptions
${subTable(report.detected)}

## Ignored by you (false positives)
${subTable(report.ignoredByYou_falsePositives)}

## Confirmed manually by you
${report.confirmedByYou.join(", ") || "_none_"}

## Recurring-looking but not detected (possible misses)
${
  candidates.length
    ? [
        row([
          "merchant",
          "category",
          "charges",
          "median interval (days)",
          "last intervals",
          "cadence fit",
          "distinct-amount share",
          "types",
          "description shapes",
        ]),
        row(Array(9).fill("---")),
        ...candidates.map((c) =>
          row([
            c.merchant,
            c.category,
            c.charges,
            c.medianIntervalDays,
            c.intervals.join(" "),
            c.cadenceFit,
            c.distinctAmountsShare,
            c.types.join("/"),
            c.descriptionShapes.join(" · "),
          ]),
        ),
      ].join("\n")
    : "_none_"
}

## What looked wrong to you?
_Add notes here, referring to merchants by their alias (e.g. "merchant-012 is my gym, it should be monthly")._
`;
writeFileSync(mdPath, md);

console.log(`Read ${txs.length} transactions from ${basename(input)}.`);
console.log(`Wrote ${mdPath}`);
console.log(`Wrote ${jsonPath}`);
console.log("Review the report before sharing it. Delete the original export when you're done.");
