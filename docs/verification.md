# Initial foundation verification — 2026-10-23

Scope: local source, fictional fixtures, embedded PostgreSQL and Chromium. This is not a deployed system, completed replacement, legal/security certification or migration result.

## Checks actually executed

| Check | Result | Evidence and limits |
|---|---|---|
| `npm install` | Passed; 141 packages initially added, zero reported vulnerabilities at install | Lockfile committed; this registry snapshot is not a security guarantee |
| `npm run check` | Passed | TypeScript 5.9.3; core, API and web |
| `npm test` | 11 passed, 0 failed | `apps/api/test/backend.test.ts`; PGlite 0.5.11 |
| `npm run build` / `npm run build:demo` | Passed for core, API, default web and explicit demo build | React 19.3.1, Vite 7.3.7, Fastify 5.12.7; actual host Node 25.5.0/npm11.8.0 |
| `npm run test:e2e` | 8 connected Chromium flows passed | `tests/e2e/work-money.spec.ts`; Playwright1.64.1 |
| `npm run format:check` | Passed after final formatting | Source formatted for other agents to review; no minified application source |
| Real server launched with configuration removed | Exited1 with configuration-required error | No successful demo fallback or database connection attempted |
| Visual checks | Desktop1440×1000 and phone390×844 inspected; width320 checked for horizontal overflow | Ignored screenshots generated under `test-results/`; fictional data only |
| Independent code review | No demonstrated serious auth/isolation defect found in the bounded slice | Another agent reviewed code; not an exhaustive security audit |

The backend scenarios cover active grants/modules/membership, business and assignment scope, foreign links, price redaction, server-controlled payer, missing-receipt reason, self-approval denial, stale versions, command replay/key conflicts, audit rollback/immutability, JWT claim/signature/expiry failures and hostile demo origins. Tests also execute a complete API flow with the exact restricted runtime grants documented in `db/README.md` and check RLS/context reset. The simultaneous embedded test is serialized by PGlite: **real PostgreSQL concurrent-session behavior remains unverified**.

Browser checks include manager assignment → worker completion → worker expense → manager review; worker review-note visibility; retry after the API commits but its response is lost (exactly one expense); stale job and expense-review recovery; failed API access without fixture fallback; revoked workspace access clearing cached data; mobile actions and modal behavior; production-mode setup-only screen with no business requests.

## Issues found and resolved

- Review notes were initially not visible to the submitting worker; authorized rows now display them.
- A review conflict originally required closing the form; explicit refresh now preserves the review-note draft and refuses to overwrite an already-reviewed expense.
- Cached data after failed workspace refresh is now cleared.
- Small-screen supporting text and the action panel were adjusted after screenshot inspection; record-version implementation details were removed from the user screen.
- The first browser run passed all six then-existing flows but its test server teardown left detached children running. Those task-owned processes were stopped; graceful SIGTERM shutdown was added and the expanded eight-flow run exited normally in6seconds.
- Startup database-role ownership checks were broadened and safe transport/unknown-route error shapes aligned.

## Checks not performed

- Docker/real PostgreSQL boot, pg pool/network/concurrent-session behavior, deployed migrations or restore: Docker daemon unavailable on initial inspection; no existing shared stack was touched.
- Actual GoTrue/provider sign-in, invitations, session revocation, live frontend/auth integration or account provisioning.
- Receipt upload/download/retention, payment/reimbursement correctness, time/trip capture or other features not implemented yet.
- Legacy code/data reconciliation, imports, external integration delivery, production monitoring or Vercel/VPS deployment.
- CI on GitHub: workflow file is prepared, but no remote repository or hosted CI run exists.
- Complete WCAG audit, physical-device/keyboard testing, offline sync or native clients. Browser checks cover the documented local layouts only.

## Source and specification state

`docs/source-map.md` inventories implemented paths. Final requirements export validation found 15 notes, approximately 15,147 words, 140 resolved wikilinks, zero broken links and matching hashes for all portable copies. Product requirements are canonical in the user's Obsidian `business-suite` folder; `docs/requirements` is its dated portable snapshot. Snapshot provenance is recorded separately from test evidence. The exact product name, license and unanswered workflow decisions remain open. See the NOTE-007 report in the vault for final repository state and handoff.
