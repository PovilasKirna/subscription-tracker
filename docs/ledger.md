# Ledger

| ID | Status | Item | Evidence |
|----|--------|------|----------|
| R-1 | done | PR #43 Copilot: same-day rows in `spending.ts` projection guard are nondeterministic (savings transfer + fee can reappear as spending) | `isLaterCharge`: latest day, then largest payment, then id. New test "a savings transfer with a same-day fee stays unprojected whichever row comes last" fails on old code, passes now. 235 + 13 tests green. |
| R-2 | done | PR #43 Copilot: stale/hidden category IDs in URL filters give blank Category chip and zero results (`filters.ts`, `search-params.ts`) | Table and page both drop ids that aren't `selectable`; URL tidied in an effect. Browser: `/transactions?category=c_deleted,groceries` → URL rewritten to `category=groceries`, chip "Category: Groceries", rows load, server log clean. |
| R-3 | done | PR #43 Copilot: `getCategoryUsage()` not refreshed by category/assignment mutations (`mutations.ts`) | `keys.categoryUsage` = `["category-usage"]`, added to DERIVED and CATEGORIZED. Typecheck + lint green. |
| R-4 | done | Open PR to dev with R-1..R-3, reply on #43 threads | PR https://github.com/PovilasKirna/subscription-tracker/pull/44 (commit fb3881a); replies posted on the three Copilot threads (2026-10-07). |
| R-5 | waiting | CI on PR #44 | 1 passing, 2 pending at 2026-10-07 |
