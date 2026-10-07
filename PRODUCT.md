# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person: the owner, using their own Revolut account. The open-source release (MIT, self-host or Vercel deploy) is a side effect, not a design audience. Design for someone who knows the app well, checks it repeatedly, and often does so on a phone.

## Product Purpose

Read Revolut transactions, find the recurring charges among them, and show what subscriptions really cost. The owner opens it to:

- **Check monthly cost:** what subscriptions cost per month and year, and whether that is rising.
- **Find things to cancel:** forgotten, overlapping, stopped, or price-hiked subscriptions.
- **See upcoming renewals:** what is about to charge, so nothing is a surprise.
- **Curate detections:** confirm, rename, recategorize, mark cancelled, or ignore what the detector found.

Success is that the owner knows their recurring spend and acts on it (cancels, accepts, corrects) without opening a banking app or spreadsheet.

## Positioning

Self-hosted and private: bank data stays in the owner's own database, with no telemetry and no third party beyond the licensed Open Banking provider the owner links themselves. Detection is grounded in the owner's real transaction history (normalized merchants, fitted cadences, amount stability, multi-plan splitting, price-change and overdue/stopped flags), not in a catalogue of known services.

## Operating Context

- Data arrives by Revolut CSV statement import (fully offline) and/or optional Enable Banking sync (incremental, every 12 hours on self-host, daily via Vercel Cron, plus manual **Sync now**). Bank consent lasts up to 180 days, then the app asks to reconnect.
- Pages: Overview (`/`), Subscriptions, Transactions, Settings (General, Notifications, Data & sync, Reimbursements, Account), Login, plus Privacy and Terms (needed for the Open Banking app registration).
- Notifications: an in-app bell plus optional Web Push and email (renewal reminders, summaries). Installable as a PWA.
- Reimbursements: charges partly paid by someone else (e.g. an employer) are tracked so spend can be shown net ("paid by me" vs "subsidised").
- Single-user password login. Environments: local (sample data, mock bank), Vercel Preview (seeded sample data), Production (real data).
- Base currency defaults to EUR.

## Capabilities and Constraints

- Stack: Next.js 16 App Router (server-rendered, Suspense streaming), TanStack Query, nuqs URL state, **shadcn/ui on Base UI + Tailwind v4 (keep this component stack)**, TanStack Charts, libSQL/Turso, Biome.
- Charts follow rules in README "Charts": CSS-variable series palette validated in light and dark mode, fixed color slot per subscription by first-seen date (the owner can also pick a preset or custom color), bar marks of 24px max width, and a hover/focus tooltip in a portal. Chart table views were deliberately removed (2026-10-05); chart data must instead stay reachable by keyboard and screen reader.
- Subscriptions can show the service's logo (`MerchantIcon`, per-subscription website).
- Light and dark themes (next-themes).
- **Phone use is first-class:** mobile layouts must be designed for real use, not merely not broken.
- CSV uploads are capped at about 4 MB on Vercel.
- Cadences detected: weekly, monthly, quarterly, semiannual, yearly.

## Brand Commitments

- Name: **Hoard** (`src/lib/site.ts`). Logo: the Hoard mark, a tilted gold ring with an orbiting coin on a near-black tile (`src/components/shell/HoardMark.tsx`, mirrors `src/app/icon.svg`). Description: "Self-hosted subscription tracker for your Revolut account".
- **Privacy-first tone:** the UI never reads like a fintech upsell. No growth nudges, no "connect more accounts", no dark patterns. Plain, factual copy that respects the owner's data.

## Evidence on Hand

- Sample data: `samples/revolut-sample.csv` (fake), seeded via `npm run sample && npm run seed`, and a mock bank (`npm run mock:bank`).
- The Hoard logo and PWA icons exist; no testimonials or marketing assets do. Do not invent any.

## Product Principles

1. **Answer the money question first.** Every surface leads with what recurring spend is and how it is changing.
2. **Surface what needs a decision.** Price hikes, overdue or stopped charges, and upcoming renewals are actionable signals, not decoration.
3. **The owner is the authority.** Detection is a proposal; correcting it (confirm, rename, ignore) must be fast and reversible.
4. **Quiet and private.** No upsell, no noise, no data leaving the owner's control.
5. **Phone and desktop are equals.** A quick check on a phone is a primary use, not a fallback.

## Accessibility & Inclusion

WCAG 2.2 AA is required: text and UI contrast in both themes, full keyboard operation, visible focus, screen-reader labels, and chart data reachable by keyboard and screen reader (focusable marks with accessible names).
