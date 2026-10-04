// Local stand-in for the Enable Banking API so the whole Revolut sync flow can be exercised
// without real credentials:   npm run mock:bank
//
// Then add to .env.local and restart `npm run dev`:
//   ENABLE_BANKING_APP_ID=mock-app
//   ENABLE_BANKING_API_URL=http://localhost:4010
//   ENABLE_BANKING_KEY_PATH=./data/mock-enablebanking.pem
//
// It implements the endpoints the app uses, verifies the RS256 JWT with the public half of the
// key, shows a fake "Revolut" consent page, replays samples/revolut-sample.csv as bank
// transactions (bank-style merchant names, ISO 20022 codes, pagination) on a main account plus a
// small "Savings" account (to try the per-account Included switch), and enforces the 4-per-day
// limit on background (no PSU headers) fetches.
import { createHash, createPublicKey, createVerify, generateKeyPairSync, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { parseCsv } from "../src/lib/server/revolutCsv";

const PORT = Number(process.env.MOCK_BANK_PORT ?? 4010);
const KEY_PATH = "data/mock-enablebanking.pem";
const APP_ID = "mock-app";

if (!existsSync(KEY_PATH)) {
  mkdirSync("data", { recursive: true });
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  writeFileSync(KEY_PATH, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  console.log(`Generated ${KEY_PATH}`);
}
const publicKey = createPublicKey(readFileSync(KEY_PATH, "utf8"));

// ---------- fake bank data (from the sample CSV) ----------
const BANK_NAMES: Record<string, string> = {
  "Lemon Gym": "UAB LEMON GYM",
  "Telia Lietuva": "TELIA LIETUVA, AB",
  "Netflix.com": "NETFLIX.COM",
  "Premium plan fee": "Premium plan fee",
};
const CODES: Record<string, { code: string; sub_code?: string; description: string }> = {
  CARD_PAYMENT: { code: "CCRD", sub_code: "POSD", description: "Card payment" },
  TOPUP: { code: "RCDT", sub_code: "ESCT", description: "Top-up" },
  TRANSFER: { code: "ICDT", sub_code: "ESCT", description: "Transfer" },
  EXCHANGE: { code: "FXDL", description: "Exchange" },
  FEE: { code: "CHRG", description: "Fee" },
  CARD_REFUND: { code: "RFND", description: "Card refund" },
};

type EbTx = Record<string, unknown> & { booking_date: string };
function loadTransactions(): EbTx[] {
  if (!existsSync("samples/revolut-sample.csv")) throw new Error("Run `npm run sample` first.");
  const [header, ...rows] = parseCsv(readFileSync("samples/revolut-sample.csv", "utf8"));
  const i = (name: string) => header.indexOf(name);
  const out: EbTx[] = [];
  for (const r of rows) {
    if (r[i("State")] !== "COMPLETED") continue;
    const amount = Number(r[i("Amount")]);
    const type = r[i("Type")];
    const desc = r[i("Description")];
    const debit = amount < 0;
    const party = { name: BANK_NAMES[desc] ?? desc };
    out.push({
      entry_reference: createHash("sha256").update(r.join("|")).digest("hex").slice(0, 20),
      transaction_amount: { amount: Math.abs(amount).toFixed(2), currency: r[i("Currency")] },
      credit_debit_indicator: debit ? "DBIT" : "CRDT",
      status: "BOOK",
      booking_date: r[i("Completed Date")].slice(0, 10),
      value_date: r[i("Completed Date")].slice(0, 10),
      creditor: debit ? party : null,
      debtor: debit ? null : party,
      remittance_information: [desc],
      bank_transaction_code: CODES[type] ?? null,
      merchant_category_code: type === "CARD_PAYMENT" ? "5815" : null,
    });
  }
  // Something the CSV doesn't have yet: a new subscription that only bank sync will reveal.
  const today = new Date();
  for (let m = 3; m >= 0; m--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, 2));
    if (d > today) continue;
    const date = d.toISOString().slice(0, 10);
    out.push({
      entry_reference: `duolingo-${date}`,
      transaction_amount: { amount: "12.99", currency: "EUR" },
      credit_debit_indicator: "DBIT",
      status: "BOOK",
      booking_date: date,
      creditor: { name: "DUOLINGO" },
      remittance_information: ["Duolingo Super"],
      bank_transaction_code: CODES.CARD_PAYMENT,
      merchant_category_code: "5815",
    });
  }
  // A pending card payment (must be ignored until booked).
  out.push({
    transaction_amount: { amount: "4.20", currency: "EUR" },
    credit_debit_indicator: "DBIT",
    status: "PDNG",
    booking_date: today.toISOString().slice(0, 10),
    creditor: { name: "CAIF CAFE" },
    bank_transaction_code: CODES.CARD_PAYMENT,
  });
  return out.sort((a, b) => a.booking_date.localeCompare(b.booking_date));
}

// ---------- state ----------
const auths = new Map<string, { state: string; redirect: string }>();
const codes = new Map<string, string>(); // code -> authorization id
const sessions = new Map<string, { validUntil: string; status: string }>();
const backgroundCalls = new Map<string, number[]>(); // account uid -> timestamps

// ---------- helpers ----------
function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}
const fail = (res: ServerResponse, status: number, error: string, message: string) => send(res, status, { error, message });

function verifyJwt(req: IncomingMessage): string | null {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (!token) return "Missing bearer token";
  const [h, p, sig] = token.split(".");
  if (!h || !p || !sig) return "Malformed JWT";
  const head = JSON.parse(Buffer.from(h, "base64url").toString());
  const body = JSON.parse(Buffer.from(p, "base64url").toString());
  if (head.alg !== "RS256" || head.kid !== APP_ID) return `Unexpected JWT header ${JSON.stringify(head)}`;
  if (body.iss !== "enablebanking.com" || body.aud !== "api.enablebanking.com") return "Bad iss/aud";
  if (body.exp < Date.now() / 1000) return "JWT expired";
  if (!createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, sig, "base64url")) return "Bad JWT signature";
  return null;
}
const hasPsuHeaders = (req: IncomingMessage) => Object.keys(req.headers).some((k) => k.startsWith("psu-"));
async function json(req: IncomingMessage) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

/** A second, smaller account (so the per-account "Included" switch can be tried): a monthly iCloud charge. */
function loadSavingsTransactions(): EbTx[] {
  const today = new Date();
  const out: EbTx[] = [];
  for (let m = 11; m >= 0; m--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, 14));
    if (d > today) continue;
    const date = d.toISOString().slice(0, 10);
    out.push({
      entry_reference: `icloud-${date}`,
      transaction_amount: { amount: "2.99", currency: "EUR" },
      credit_debit_indicator: "DBIT",
      status: "BOOK",
      booking_date: date,
      value_date: date,
      creditor: { name: "APPLE.COM/BILL" },
      debtor: null,
      remittance_information: ["iCloud+"],
      bank_transaction_code: CODES.CARD_PAYMENT,
      merchant_category_code: "5815",
    });
  }
  return out;
}

// ---------- server ----------
// Account uids are per session (`<prefix>-<session id>`); identification hashes are stable.
const ACCOUNTS = [
  {
    prefix: "acc",
    name: "Revolut EUR",
    currency: "EUR",
    cash_account_type: "CACC",
    account_id: { iban: "LT123250012345678901" },
    identification_hash: "mock-revolut-eur-hash",
  },
  {
    prefix: "sav",
    name: "Savings",
    currency: "EUR",
    cash_account_type: "SVGS",
    account_id: { iban: "LT993250098765432109" },
    identification_hash: "mock-revolut-savings-hash",
  },
];

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;
  console.log(req.method, path + url.search, hasPsuHeaders(req) ? "(PSU present)" : "");

  // Browser-facing consent page (no JWT).
  if (path === "/authorize") {
    const a = auths.get(url.searchParams.get("auth") ?? "");
    if (!a) return send(res, 404, "Unknown authorization", { "Content-Type": "text/plain" });
    const code = randomUUID();
    codes.set(code, url.searchParams.get("auth") ?? "");
    const ok = `${a.redirect}?state=${a.state}&code=${code}`;
    const no = `${a.redirect}?state=${a.state}&error=access_denied&error_description=${encodeURIComponent("You declined access in Revolut")}`;
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(`<!doctype html><meta charset="utf-8"><meta name=viewport content="width=device-width"><title>Mock Revolut</title>
      <body style="font-family:system-ui;background:#0b0b0b;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0">
      <div style="max-width:360px;padding:28px;border-radius:16px;background:#1a1a19">
      <div style="font-size:12px;opacity:.6">MOCK — Enable Banking sandbox stand-in</div>
      <h2>Revolut</h2><p>"Subscription tracker" wants read-only access to your EUR account balances and transactions for 180 days.</p>
      <a id="approve" href="${ok}" style="display:block;text-align:center;padding:12px;border-radius:10px;background:#2a78d6;color:#fff;text-decoration:none">Allow</a>
      <a id="deny" href="${no}" style="display:block;text-align:center;padding:12px;margin-top:8px;color:#aaa">Deny</a></div>`);
  }

  const jwtError = verifyJwt(req);
  if (jwtError) return fail(res, 401, "UNAUTHORIZED", jwtError);

  if (req.method === "GET" && path === "/aspsps") {
    const country = url.searchParams.get("country") ?? "LT";
    return send(res, 200, {
      aspsps: [
        { name: "Revolut", country, maximum_consent_validity: 15552000, psu_types: ["personal", "business"], required_psu_headers: [] },
        { name: "Swedbank", country, maximum_consent_validity: 7776000, psu_types: ["personal"], required_psu_headers: [] },
      ],
    });
  }
  if (req.method === "POST" && path === "/auth") {
    const body = await json(req);
    if (!body.redirect_url || !body.state || !body.aspsp?.name) return fail(res, 422, "WRONG_REQUEST_PARAMETERS", "Missing fields");
    const id = randomUUID();
    auths.set(id, { state: body.state, redirect: body.redirect_url });
    return send(res, 200, { url: `http://localhost:${PORT}/authorize?auth=${id}`, authorization_id: id });
  }
  if (req.method === "POST" && path === "/sessions") {
    const { code } = await json(req);
    if (!codes.has(code)) return fail(res, 422, "WRONG_AUTHORIZATION_CODE", "Unknown code");
    codes.delete(code);
    const session_id = randomUUID();
    const validUntil = new Date(Date.now() + 180 * 86400_000).toISOString();
    sessions.set(session_id, { validUntil, status: "AUTHORIZED" });
    return send(res, 200, {
      session_id,
      accounts: ACCOUNTS.map(({ prefix, ...a }) => ({ ...a, uid: `${prefix}-${session_id.slice(0, 8)}` })),
      access: { valid_until: validUntil },
    });
  }
  const sessionMatch = path.match(/^\/sessions\/([^/]+)$/);
  if (sessionMatch) {
    const s = sessions.get(sessionMatch[1]);
    if (!s) return fail(res, 404, "SESSION_DOES_NOT_EXIST", "No such session");
    if (req.method === "DELETE") {
      sessions.delete(sessionMatch[1]);
      return send(res, 200, { message: "OK" });
    }
    return send(res, 200, { session_id: sessionMatch[1], status: s.status, access: { valid_until: s.validUntil } });
  }
  const txMatch = path.match(/^\/accounts\/([^/]+)\/transactions$/);
  if (req.method === "GET" && txMatch) {
    const uid = decodeURIComponent(txMatch[1]);
    if (![...sessions.keys()].some((id) => ACCOUNTS.some((a) => uid === `${a.prefix}-${id.slice(0, 8)}`)))
      return fail(res, 401, "EXPIRED_SESSION", "Session expired or revoked");
    if (!hasPsuHeaders(req) && !url.searchParams.get("continuation_key")) {
      const recent = (backgroundCalls.get(uid) ?? []).filter((t) => t > Date.now() - 86400_000);
      if (recent.length >= 4) return fail(res, 429, "ASPSP_RATE_LIMIT_EXCEEDED", "Background fetch limit reached (4/day)");
      backgroundCalls.set(uid, [...recent, Date.now()]);
    }
    await new Promise((r) => setTimeout(r, Number(process.env.MOCK_BANK_DELAY_MS ?? 400))); // feel like a real bank
    const strategy = url.searchParams.get("strategy");
    const from = strategy === "longest" ? "0000-00-00" : (url.searchParams.get("date_from") ?? "0000-00-00");
    const all = (uid.startsWith("sav-") ? loadSavingsTransactions() : loadTransactions()).filter((t) => t.booking_date >= from);
    const offset = Number(url.searchParams.get("continuation_key") ?? 0);
    const page = all.slice(offset, offset + 100);
    const next = offset + 100 < all.length ? String(offset + 100) : null;
    return send(res, 200, { transactions: page, continuation_key: next });
  }
  fail(res, 404, "NOT_FOUND", `${req.method} ${path}`);
}).listen(PORT, () => console.log(`Mock Enable Banking on http://localhost:${PORT} (app id: ${APP_ID}, key: ${KEY_PATH})`));
