# Subscription tracker

A small, self-hosted web app that reads your **Revolut** transactions, finds your subscriptions, and shows what they cost: monthly totals, price increases, upcoming renewals, and a timeline of every recurring charge.

- **Free and open source** (MIT). Self-host it as one container with one SQLite file, or deploy it to **Vercel** with a hosted libSQL (Turso) database. No telemetry.
- **Two ways to get data in:**
  1. **CSV import**: export a statement from the Revolut app and drop it in. Fully offline.
  2. **Automatic sync (optional)**: [Enable Banking](https://enablebanking.com) is a licensed Open Banking provider that is free for linking your *own* accounts. The app pulls new transactions every 12 hours.
- **Detection** groups charges by normalized merchant, then fits weekly, monthly, quarterly, semiannual or yearly cadences. It scores how stable the amounts are and splits merchants that bill several plans (like Apple). It also flags price changes, plus subscriptions that are overdue or have stopped. You can confirm, rename, recategorize, mark as cancelled, or ignore anything it finds.

## Stack

Next.js 16 (App Router, server-rendered, streamed with Suspense) · TanStack Query (server prefetch + `useSuspenseQuery`) · nuqs (type-safe URL state) · shadcn/ui on Base UI + Tailwind v4 · visx charts · libSQL (`@libsql/client`: a local SQLite file, or Turso) · Biome · Husky.

```
src/
  app/            routes: (app)/ pages, api/ route handlers, login
  charts/         every chart (visx). Pages import from "@/charts" only
  components/     page sections, skeletons, shell, shadcn ui/
  lib/server/     db, detection, Revolut CSV parser, Enable Banking client, auth
  lib/query/      query options shared by server prefetch + client
  lib/search-params.ts   nuqs parsers shared by server + client
```

## Quick start (local)

```bash
npm install
cp .env.example .env        # set APP_PASSWORD
npm run dev                 # http://localhost:3000
```

To try it with fake data first: `npm run sample && npm run seed`.

### Getting your Revolut data (CSV)

In the Revolut app, go to **Accounts → (your EUR account) → … → Statement**. Choose **Excel** (it downloads as CSV), pick a period (as long as you like), then upload it on the **Data & sync** page. Re-importing overlapping periods is safe: rows are de-duplicated.

### Automatic sync with Enable Banking (optional)

1. Create an account at <https://enablebanking.com> and add an **application** in the Control Panel. Choose **Production** and add the redirect URL `https://<your-host>/api/bank/callback`. Enable Banking only accepts **https**. Locally, run `npm run dev:https` and use `https://localhost:3000/api/bank/callback`. On first run, Next creates a locally trusted certificate with mkcert, and Windows/macOS will ask you to approve installing its local CA. Keep the private key file it gives you.
2. On the application, click **Activate by linking accounts** and link your Revolut account. This turns on the free *restricted* mode, which only works with accounts you've linked yourself.
3. Copy the key to `data/enablebanking.pem` and set `ENABLE_BANKING_APP_ID` (and `ENABLE_BANKING_REDIRECT_URL`) in `.env`, then restart.
4. On **Data & sync**, pick your country and Revolut, then click **Connect**. You'll approve access in Revolut. Consent lasts up to 180 days; after that the page asks you to reconnect.

How the sync works:

- **First sync is the full history.** Banks typically expose full history only for a short time after consent. So right after you connect, the app asks for everything the bank allows (`strategy=longest`), while you are still present.
- **Afterwards it's incremental.** A scheduler checks every hour and syncs a connection once it's older than `SYNC_INTERVAL_HOURS` (default 12, minimum 6). Each sync re-reads the last 7 days so late bookings are caught. Restarts never trigger extra syncs.
- **Rate limits are respected.** Banks allow about 4 background fetches per day. Scheduled syncs send no PSU headers and back off for 6 hours after `ASPSP_RATE_LIMIT_EXCEEDED`. **Sync now** sends PSU headers (you're present), so the limit doesn't apply to it. If a bank requires headers the app can't provide, it sends none, because a partial set is rejected.
- **CSV and bank data merge cleanly.** Bank rows get a type from ISO 20022 bank transaction codes and the merchant category code (MCC), so transfers, top-ups and exchanges never look like subscriptions. A bank row that matches a CSV row is skipped: same amount, within ±3 days, and the same merchant even under a bank-style name like "UAB LEMON GYM" for "Lemon Gym". The match is one-to-one.
- **Reconnecting is safe.** Transactions are keyed by the account's stable `identification_hash`, not the per-session account id, so a reconnect doesn't duplicate anything. Expired or revoked access is detected and shows a **Reconnect** button.
- Pending transactions are ignored until they're booked.

#### Trying the sync without credentials

`npm run mock:bank` starts a local stand-in for Enable Banking on port 4010. It verifies your JWT signature, shows a fake Revolut consent page, replays `samples/revolut-sample.csv` with bank-style names and codes, adds a bank-only "Duolingo" subscription, and enforces the 4-per-day background limit. Add this to `.env.local` and restart `npm run dev`:

```
ENABLE_BANKING_APP_ID=mock-app
ENABLE_BANKING_API_URL=http://localhost:4010
ENABLE_BANKING_KEY_PATH=./data/mock-enablebanking.pem
```

## Deploy to Vercel (with your own domain)

Vercel runs the app as serverless functions, so two things differ from self-hosting. The database lives in **Turso** (hosted libSQL, free tier). The scheduled sync runs as a **Vercel Cron** job instead of a timer.

1. **Create the project:** run `npx vercel login`, then `npx vercel link` in this folder, or import the Git repo in the Vercel dashboard.
2. **Add a database:** Vercel → your project → **Storage** → **Marketplace → Turso** → create a database. This adds `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Any libSQL URL also works via `DATABASE_URL` / `DATABASE_AUTH_TOKEN`. Tables are created on first request.
3. **Set environment variables** (Production):

   | Variable | Value |
   |---|---|
   | `APP_PASSWORD` | your login password |
   | `SESSION_SECRET` | `openssl rand -hex 32` (required on Vercel) |
   | `CRON_SECRET` | another random string; Vercel Cron sends it to `/api/cron/sync` |
   | `ENABLE_BANKING_APP_ID` | your Enable Banking application id |
   | `ENABLE_BANKING_PRIVATE_KEY` | the full contents of the `.pem` file |
   | `ENABLE_BANKING_REDIRECT_URL` | `https://<your-domain>/api/bank/callback` |
   | `BASE_CURRENCY` | `EUR` (optional) |

4. **Deploy:** `npx vercel --prod`.
5. **Add your domain:** in Vercel → **Settings → Domains**, add e.g. `subs.example.com`. Then in Hostinger (**Domains → DNS / Nameservers → DNS records**), add the record Vercel shows. For a subdomain that's a `CNAME` from `subs` to `cname.vercel-dns.com`. For the apex domain it's an `A` record from `@` to the IP Vercel shows. HTTPS is issued automatically.
6. Whitelist `https://<your-domain>/api/bank/callback` in your Enable Banking app, then connect Revolut on the Data page.

Notes:

- On the Hobby plan, Vercel Cron runs at most once a day (`vercel.json` schedules 05:00 UTC). That's within Revolut's background limit, and **Sync now** works any time.
- CSV uploads are limited to about 4 MB on Vercel. For longer histories, export your statement in a few periods.
- To move existing local data, re-import your CSV in the deployed app, or run `npm run seed -- your-statement.csv` with `DATABASE_URL` and `DATABASE_AUTH_TOKEN` set.

## Self-hosting

```bash
cp .env.example .env   # set APP_PASSWORD; set COOKIE_SECURE=true behind HTTPS
docker compose up -d --build
```

The container listens on `127.0.0.1:3000` and keeps everything in `./data` (`tracker.db`, the cookie secret, and your Enable Banking key). Put it behind HTTPS before you open it to the internet. Easy options are **Tailscale** (`tailscale serve 3000`, private to your devices), a **Cloudflare Tunnel**, or Caddy. It runs fine on a Raspberry Pi, a NAS, or any small VPS.

**Backups:** use **Export JSON backup** on the Data page, or copy `data/tracker.db`.

### Security notes

- Single-user login with a password from `APP_PASSWORD`. Sessions are HMAC-signed, `HttpOnly` and `SameSite=Lax` cookies, and login attempts are rate-limited.
- Every page and API route is checked by `src/proxy.ts`, and each route handler checks again.
- The bank callback is authorized by a one-time `state` value that expires after an hour.
- Your Enable Banking key and database never leave `data/`, which is gitignored and dockerignored.
- Revolut credentials never touch this app. You approve access in Revolut's own app.

## Development

| Command | What it does |
|---|---|
| `npm run dev` | Next dev server |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run lint` / `lint:fix` | Biome lint + format check |
| `npm test` | Unit tests (`node:test`): CSV parsing, detection, auth |
| `npm run sample` / `seed` | Generate fake Revolut CSV / import a CSV into the DB |

A Husky **pre-commit** hook runs Biome on the staged files (auto-fixes and re-stages them), then the typecheck and the tests.

### Charts

All charts live in `src/charts/` and are built with visx primitives. They follow these rules:

- **Colors:** colors come from CSS variables (`--series-1…8`, `--surface-1`, `--grid`, `--axis`, text tokens), with light and dark values. The palette passes the dataviz validator in both modes. A subscription's color slot is fixed by first-seen date, so filtering never repaints the remaining series.
- **Marks:** bars are at most 24px wide, the top segment of each stack has a 4px rounded end, and stacked segments are separated by a 2px surface gap.
- **Interaction:** every chart has a hover tooltip, rendered in a portal so it is never clipped, plus a table view.
