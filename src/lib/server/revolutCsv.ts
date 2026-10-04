import { createHash } from "node:crypto";
import type { TxRow } from "./db";
import { merchantKey } from "./merchant";

/** RFC 4180-ish CSV parser: quotes, escaped quotes, CRLF, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.indexOf("\n") === -1 ? undefined : src.indexOf("\n"));
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

// Header aliases across Revolut personal and business exports.
const ALIASES = {
  type: ["type"],
  product: ["product", "account"],
  started: ["started date", "date started (utc)", "date started"],
  completed: ["completed date", "date completed (utc)", "date completed", "date"],
  description: ["description", "reference", "merchant"],
  amount: ["amount", "total amount"],
  fee: ["fee", "fee amount"],
  currency: ["currency", "payment currency"],
  state: ["state"],
} as const;

type Field = keyof typeof ALIASES;

export class CsvFormatError extends Error {}

const SKIP_STATES = new Set(["REVERTED", "DECLINED", "FAILED", "CANCELLED"]);

function toMinor(value: string): number {
  const n = Number(
    value
      .replace(/\s/g, "")
      .replace(/,(\d{1,2})$/, ".$1")
      .replace(/,/g, ""),
  );
  if (!Number.isFinite(n)) throw new CsvFormatError(`Not a number: "${value}"`);
  return Math.round(n * 100);
}

function toIsoDate(value: string): string | null {
  const v = value.trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/); // DD.MM.YYYY or DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export type ParseResult = { rows: TxRow[]; skipped: number };

/** Parse a Revolut account statement exported as CSV (app → Statements → Excel/CSV). */
export function parseRevolutCsv(text: string): ParseResult {
  const table = parseCsv(text);
  if (table.length < 2) throw new CsvFormatError("The file is empty or has no transactions.");

  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = {} as Record<Field, number>;
  for (const field of Object.keys(ALIASES) as Field[]) {
    col[field] = header.findIndex((h) => (ALIASES[field] as readonly string[]).includes(h));
  }
  if (col.amount < 0 || col.description < 0 || (col.started < 0 && col.completed < 0)) {
    throw new CsvFormatError(
      "This doesn't look like a Revolut CSV statement (expected columns like Started Date, Description, Amount, Currency).",
    );
  }

  const seen = new Map<string, number>();
  const rows: TxRow[] = [];
  let skipped = 0;
  for (const r of table.slice(1)) {
    const get = (f: Field) => (col[f] >= 0 ? (r[col[f]] ?? "").trim() : "");
    const state = get("state").toUpperCase() || null;
    const timestamp = get("started") || get("completed");
    const date = toIsoDate(timestamp);
    if (!date || (state && SKIP_STATES.has(state)) || !get("amount")) {
      skipped++;
      continue;
    }
    const description = get("description") || "Unknown";
    const fee = get("fee") ? toMinor(get("fee")) : 0;
    const amount = toMinor(get("amount")) - fee;
    const currency = (get("currency") || "EUR").toUpperCase();
    const product = get("product") || null;

    // Stable id that survives re-importing overlapping statements; state is excluded
    // so a PENDING row is updated in place once it shows up as COMPLETED.
    const base = createHash("sha256")
      .update([product, timestamp, description, get("amount"), currency].join("|"))
      .digest("hex")
      .slice(0, 32);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);

    rows.push({
      id: `csv:${base}${n > 1 ? `#${n}` : ""}`,
      source: "csv",
      account: product,
      date,
      amount_minor: amount,
      currency,
      description,
      merchant_key: merchantKey(description),
      type: get("type").toUpperCase() || null,
      state,
    });
  }
  return { rows, skipped };
}
