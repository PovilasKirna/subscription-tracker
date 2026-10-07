# Ledger

| ID | Status | Item | Evidence |
|----|--------|------|----------|
| R-1 | done | PR #43 Copilot: same-day rows in `spending.ts` projection guard are nondeterministic (savings transfer + fee can reappear as spending) | `isLaterCharge`: latest day, then largest payment, then id. New test "a savings transfer with a same-day fee stays unprojected whichever row comes last" fails on old code, passes now. 235 + 13 tests green. |
| R-2 | done | PR #43 Copilot: stale/hidden category IDs in URL filters give blank Category chip and zero results (`filters.ts`, `search-params.ts`) | Table and page both drop ids that aren't `selectable`; URL tidied in an effect. Browser: `/transactions?category=c_deleted,groceries` → URL rewritten to `category=groceries`, chip "Category: Groceries", rows load, server log clean. |
| R-3 | done | PR #43 Copilot: `getCategoryUsage()` not refreshed by category/assignment mutations (`mutations.ts`) | `keys.categoryUsage` = `["category-usage"]`, added to DERIVED and CATEGORIZED. Typecheck + lint green. |
| R-4 | done | Open PR to dev with R-1..R-3, reply on #43 threads | PR https://github.com/PovilasKirna/subscription-tracker/pull/44 (commit fb3881a); replies posted on the three Copilot threads (2026-10-07). |
| R-5 | done | CI on PR #44 | PR #44 merged into dev 2026-10-07 (56547fa) |
| R-6 | done | Release PR dev → main for the #43 review fixes (user, 2026-10-07) | https://github.com/PovilasKirna/subscription-tracker/pull/45 |
| V-1 | done | Vercel notice 2026-10-07: Function Storage at 75 % of the Hobby 10 GB. Find out what counts and whether it is expected | Expected. "Functions Storage" = retained Vercel Function bundles (one Next.js bundle per deployment, per region). Project `subscription-tracker` has 124 deployments since 2026-10-04 (117 READY, 16 production, 28 branches: every push to dev, main and each `claude/*` branch builds a preview). Hobby keeps deployments ~30 days; at 100 % Vercel deletes old unprotected ones immediately instead of blocking deploys (changelog 2026-09-16). Sources: vercel.com/docs/deployment-storage, /docs/deployment-storage/optimize, changelog "hobby-projects-now-retain-fewer-deployments". |
| V-2 | open | Decide: stop Vercel building `claude/*` branches (vercel.json `ignoreCommand`, or Git settings) so only dev and main deploy. Cuts future deployments by ~70 % | user decision |
| V-3 | open | Dashboard: Project → Settings → Security → Deployment Retention Policy, shorten Pre-Production retention; optionally delete old preview deployments now | user action in Vercel dashboard |
