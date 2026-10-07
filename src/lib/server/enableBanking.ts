import { createHash, createSign, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "./config";
import type { TxRow } from "./db";
import { merchantKey } from "./merchant";

// Client for the Enable Banking API (https://enablebanking.com/docs/api/reference/).
// In "restricted production" mode it is free for linking your own accounts — that is
// how Revolut personal accounts get synced (Revolut has no public personal API).

export class BankApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Enable Banking error code, e.g. ASPSP_RATE_LIMIT_EXCEEDED, EXPIRED_SESSION. */
    readonly code: string | null = null,
  ) {
    super(message);
  }
  get rateLimited() {
    return this.status === 429 || this.code === "ASPSP_RATE_LIMIT_EXCEEDED";
  }
  /** Consent is gone (expired, revoked in the Revolut app, or closed) — the user must reconnect. */
  get consentLost() {
    return (
      this.status === 401 ||
      [
        "EXPIRED_SESSION",
        "CLOSED_SESSION",
        "REVOKED_SESSION",
        "SESSION_DOES_NOT_EXIST",
        "UNAUTHORIZED_ACCESS",
        "ACCOUNT_DOES_NOT_EXIST",
      ].includes(this.code ?? "")
    );
  }
}

let cachedKey: { path: string; pem: string } | undefined;
function privateKey(): string {
  const { keyPath, privateKey: inline } = config.enableBanking;
  if (inline) return inline; // ENABLE_BANKING_PRIVATE_KEY (Vercel)
  if (cachedKey?.path !== keyPath) cachedKey = { path: keyPath, pem: readFileSync(keyPath, "utf8") };
  return cachedKey.pem;
}

export function makeJwt(now = Date.now()): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const iat = Math.floor(now / 1000);
  const head = enc({ typ: "JWT", alg: "RS256", kid: config.enableBanking.appId });
  const body = enc({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat, exp: iat + 3600 });
  const signature = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey(), "base64url");
  return `${head}.${body}.${signature}`;
}

/**
 * Headers describing the person using the app right now. Sending them tells the bank the user
 * is present, so the 4-requests-per-day limit on *background* fetches doesn't apply.
 */
export type PsuContext = { ipAddress?: string; userAgent?: string; acceptLanguage?: string; referer?: string };

const PSU_HEADER: Record<keyof PsuContext, string> = {
  ipAddress: "Psu-Ip-Address",
  userAgent: "Psu-User-Agent",
  acceptLanguage: "Psu-Accept-Language",
  referer: "Psu-Referer",
};

/** Either every header the bank requires is sent, or none (a partial set is rejected). */
export function psuHeaders(psu: PsuContext | undefined, required: readonly string[] = []): Record<string, string> {
  if (!psu) return {};
  const headers: Record<string, string> = {};
  for (const [k, name] of Object.entries(PSU_HEADER) as [keyof PsuContext, string][]) {
    const v = psu[k];
    if (v) headers[name] = v;
  }
  const have = new Set(Object.keys(headers).map((h) => h.toLowerCase()));
  return required.every((r) => have.has(r.toLowerCase())) ? headers : {};
}

/** Builds a PsuContext from the incoming request of a user-initiated action. */
export function psuFromRequest(h: Headers): PsuContext {
  return {
    ipAddress: h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "127.0.0.1",
    userAgent: h.get("user-agent") ?? undefined,
    acceptLanguage: h.get("accept-language") ?? undefined,
  };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${config.enableBanking.apiUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${makeJwt()}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    let code: string | null = null;
    let detail = text.slice(0, 300);
    try {
      const body = JSON.parse(text) as { error?: string; code?: string | number; message?: string; detail?: unknown };
      code = body.error ?? (typeof body.code === "string" ? body.code : null);
      detail = body.message ?? (typeof body.detail === "string" ? body.detail : detail);
    } catch {}
    throw new BankApiError(`Enable Banking ${res.status}${code ? ` ${code}` : ""}: ${detail}`, res.status, code);
  }
  return (await res.json()) as T;
}

export type Aspsp = {
  name: string;
  country: string;
  maximum_consent_validity?: number;
  psu_types?: string[];
  required_psu_headers?: string[];
};

export async function listAspsps(country: string): Promise<Aspsp[]> {
  const r = await call<{ aspsps: Aspsp[] }>(`/aspsps?country=${encodeURIComponent(country)}&psu_type=personal`);
  return r.aspsps;
}

const MAX_CONSENT_SECONDS = 180 * 86400;

export async function startAuth(aspsp: { name: string; country: string }, maxConsentSeconds?: number, psu?: PsuContext) {
  const state = randomUUID();
  const validity = Math.min(maxConsentSeconds ?? MAX_CONSENT_SECONDS, MAX_CONSENT_SECONDS);
  const r = await call<{ url: string; authorization_id: string }>("/auth", {
    method: "POST",
    headers: psuHeaders(psu),
    body: JSON.stringify({
      access: { valid_until: new Date(Date.now() + validity * 1000).toISOString() },
      aspsp,
      state,
      redirect_url: config.enableBanking.redirectUrl,
      psu_type: "personal",
    }),
  });
  return { url: r.url, state };
}

export type EbAccount = {
  uid: string;
  name?: string | null;
  currency?: string | null;
  account_id?: { iban?: string | null } | null;
  cash_account_type?: string | null;
  /** Stable across sessions (unlike `uid`), so reconnecting doesn't duplicate history. */
  identification_hash?: string | null;
};

/** Identifier for an account that survives reconnecting the bank. */
export const accountKey = (a: EbAccount) => a.identification_hash || a.account_id?.iban || a.uid;

export type EbSession = { session_id: string; accounts: EbAccount[]; access?: { valid_until?: string } };

export async function createSession(code: string, psu?: PsuContext) {
  return call<EbSession>("/sessions", { method: "POST", headers: psuHeaders(psu), body: JSON.stringify({ code }) });
}

/** Session status as Enable Banking sees it (AUTHORIZED, EXPIRED, REVOKED, CLOSED, …). */
export async function getSessionStatus(sessionId: string): Promise<string | null> {
  const r = await call<{ status?: string }>(`/sessions/${sessionId}`);
  return r.status ?? null;
}

export async function deleteSession(sessionId: string) {
  await call(`/sessions/${sessionId}`, { method: "DELETE" });
}

export type EbTransaction = {
  entry_reference?: string | null;
  transaction_id?: string | null;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: "CRDT" | "DBIT";
  status?: string;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  remittance_information?: string[] | null;
  merchant_category_code?: string | null;
  bank_transaction_code?: { code?: string | null; sub_code?: string | null; description?: string | null } | null;
};

/**
 * Bank feeds have no Revolut "Type" column, so derive one from the ISO 20022 bank transaction
 * code / MCC. That keeps transfers, top-ups and exchanges out of subscription detection.
 */
export function transactionType(t: EbTransaction): string | null {
  const btc = t.bank_transaction_code;
  const code = [btc?.code, btc?.sub_code].filter(Boolean).join("/").toUpperCase();
  const desc = (btc?.description ?? "").toLowerCase();
  const text = `${code} ${desc} ${(t.remittance_information ?? []).join(" ").toLowerCase()}`;
  if (/CWDL|\batm\b|cash withdrawal/i.test(text)) return "ATM";
  if (/FEES|CHRG|COMM|\bfee\b|plan fee/i.test(text)) return "FEE";
  if (/FXDL|exchange|exchanged to/i.test(text)) return "EXCHANGE";
  if (/RFND|refund/i.test(text)) return "CARD_REFUND";
  if (t.merchant_category_code || /CCRD|POSD|POSP|CDPT|SMRT|card/i.test(text)) return "CARD_PAYMENT";
  if (/ICDT|RCDT|DMCT|ESCT|ESDD|SALA|transfer|top-?up|payment from|^to /i.test(text)) {
    return t.credit_debit_indicator === "CRDT" ? "TOPUP" : "TRANSFER";
  }
  return null;
}

export function mapTransaction(account: string, t: EbTransaction): TxRow | null {
  if (t.status && t.status !== "BOOK") return null; // pending rows get stable ids only once booked
  const date = t.booking_date || t.value_date || t.transaction_date;
  if (!date) return null;
  const debit = t.credit_debit_indicator === "DBIT";
  const counterparty = (debit ? t.creditor?.name : t.debtor?.name)?.trim();
  const description = counterparty || t.remittance_information?.filter(Boolean).join(" ").trim() || "Unknown";
  const minor = Math.round(Number(t.transaction_amount.amount) * 100);
  const ref =
    t.entry_reference ||
    t.transaction_id ||
    createHash("sha256")
      .update([date, t.transaction_amount.amount, t.credit_debit_indicator, description].join("|"))
      .digest("hex")
      .slice(0, 24);
  return {
    id: `bank:${account}:${ref}`,
    source: "bank",
    account,
    date: date.slice(0, 10),
    amount_minor: debit ? -Math.abs(minor) : Math.abs(minor),
    currency: t.transaction_amount.currency.toUpperCase(),
    description,
    merchant_key: merchantKey(description),
    type: transactionType(t),
    state: "COMPLETED",
    mcc: t.merchant_category_code || null,
  };
}

export type FetchOptions = {
  dateFrom: string;
  /** "longest" asks the bank for the earliest transaction it can serve (first sync). */
  strategy?: "default" | "longest";
  psu?: PsuContext;
  requiredPsuHeaders?: readonly string[];
};

export async function fetchTransactions(account: EbAccount, opts: FetchOptions): Promise<TxRow[]> {
  const out: TxRow[] = [];
  let continuation: string | undefined;
  for (let page = 0; page < 500; page++) {
    const qs = new URLSearchParams({ date_from: opts.dateFrom });
    if (opts.strategy === "longest") qs.set("strategy", "longest");
    if (continuation) qs.set("continuation_key", continuation);
    const r = await call<{ transactions: EbTransaction[]; continuation_key?: string | null }>(
      `/accounts/${encodeURIComponent(account.uid)}/transactions?${qs}`,
      { headers: psuHeaders(opts.psu, opts.requiredPsuHeaders) },
    );
    for (const t of r.transactions) {
      const row = mapTransaction(accountKey(account), t);
      if (row) out.push(row);
    }
    if (!r.continuation_key) break;
    continuation = r.continuation_key;
  }
  return out;
}

export type EbBalance = {
  name?: string | null;
  balance_amount: { amount: string; currency: string };
  /** ISO 20022 balance type: ITBD interim booked, CLBD closing booked, ITAV interim available, … */
  balance_type?: string | null;
  last_change_date_time?: string | null;
  reference_date?: string | null;
};

/**
 * Most "money you have right now" first: booked balances (no credit limit or card holds mixed in),
 * intraday before end-of-day, then expected and available ones.
 */
const BALANCE_PREFERENCE = ["ITBD", "CLBD", "XPCD", "ITAV", "CLAV", "VALU", "OPBD", "OPAV", "PRCD", "INFO", "OTHR", "FWAV"];

/** The balance that best answers "how much is in this account now", in minor units. Pure. */
export function pickBalance(
  balances: EbBalance[],
  accountCurrency?: string | null,
): { amountMinor: number; currency: string; type: string | null } | null {
  const usable = balances.filter((b) => b.balance_amount && Number.isFinite(Number(b.balance_amount.amount)));
  // A multi-currency account may list one balance per currency; its own currency wins.
  const own = accountCurrency ? usable.filter((b) => b.balance_amount.currency.toUpperCase() === accountCurrency.toUpperCase()) : [];
  const pool = own.length ? own : usable;
  const rank = (b: EbBalance) => {
    const i = BALANCE_PREFERENCE.indexOf((b.balance_type ?? "").toUpperCase());
    return i === -1 ? BALANCE_PREFERENCE.length : i;
  };
  const best = [...pool].sort((a, b) => rank(a) - rank(b))[0];
  if (!best) return null;
  return {
    amountMinor: Math.round(Number(best.balance_amount.amount) * 100),
    currency: best.balance_amount.currency.toUpperCase(),
    type: best.balance_type ?? null,
  };
}

export async function fetchBalance(
  account: EbAccount,
  opts: { psu?: PsuContext; requiredPsuHeaders?: readonly string[] } = {},
): Promise<ReturnType<typeof pickBalance>> {
  const r = await call<{ balances: EbBalance[] }>(`/accounts/${encodeURIComponent(account.uid)}/balances`, {
    headers: psuHeaders(opts.psu, opts.requiredPsuHeaders),
  });
  return pickBalance(r.balances ?? [], account.currency);
}
