// Creates a self-signed certificate for https://localhost (used by `npm run dev:https`).
// Unlike `next dev --experimental-https` on its own, this never touches the OS trust store:
// the browser shows a one-time "not private" warning instead. Needs `openssl`, which ships
// with Git for Windows and macOS/Linux.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";

const KEY = "certificates/localhost-key.pem";
const CERT = "certificates/localhost.pem";

if (existsSync(KEY) && existsSync(CERT)) process.exit(0);

const candidates = [
  "openssl",
  "C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe",
  "C:\\Program Files\\Git\\usr\\bin\\openssl.exe",
  `${process.env.LOCALAPPDATA ?? ""}\\Programs\\Git\\mingw64\\bin\\openssl.exe`,
];
const openssl = candidates.find((bin) => {
  try {
    execFileSync(bin, ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});
if (!openssl) {
  console.error("openssl not found. Install Git for Windows (it bundles openssl) or create certificates/localhost{,-key}.pem yourself.");
  process.exit(1);
}

mkdirSync("certificates", { recursive: true });
execFileSync(
  openssl,
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-sha256",
    "-days",
    "825",
    "-keyout",
    KEY,
    "-out",
    CERT,
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1",
  ],
  { stdio: "inherit", env: { ...process.env, MSYS_NO_PATHCONV: "1" } }, // keep Git-Bash openssl from mangling "/CN=…"
);
console.log(`Created ${CERT} (self-signed; your browser will warn once — choose "Advanced" → "Continue to localhost").`);
