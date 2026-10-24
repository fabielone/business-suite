# Implemented source map and review entry points

This map covers NOTE-007 and NOTE-008 local foundations. It does not replace the full product requirements. Read the canonical Obsidian hub or its portable snapshot in `docs/requirements` before extending behavior.

| Responsibility | Actual source | Current boundary |
|---|---|---|
| Native Android/iOS | `apps/mobile/src/{App,client,sqliteStore,money}.ts*` | React Native UI + SQLite; simulator-only fictional demo; live/physical setup-only |
| Shared offline semantics | `packages/offline/src/index.ts` | Durable intent queue, identity ownership, versions/epoch, conflicts and same-key replay; present engine demo-only |
| Browser persistence and offline shell | `apps/web/src/offline.ts`, `offline-shell.ts`, `public/` | Atomic IndexedDB, precached build assets; no API service-worker cache |
| Web shell and role-dependent screens | `apps/web/src/App.tsx`, `styles.css` | Overview, Work, Money; in-app view state at `/`, not a complete route/deep-link system |
| Web command transport | `apps/web/src/api.ts` | Local demo header only; no stored production credentials; failed requests do not substitute fixture success |
| Frontend/demo separation | `App.tsx`, `apps/web/vite.config.ts` | Explicit `demo` mode on loopback; default build shows setup screen |
| HTTP contract and common errors | `apps/api/src/app.ts` | Workspace, jobs/create/close, expenses/submit/review, health; no uploads/payments |
| Identity verification | `apps/api/src/auth.ts`, `server.ts` | Verified JWT subject, issuer, audience, expiry; server-controlled memberships and privileges; actual provider connection unverified |
| Permissions, tenancy, retries, audit | `apps/api/src/context.ts` | Transaction-local context, active membership/module/grant checks, payload-bound command receipts, audit writes |
| Work | `apps/api/src/jobs.ts` | Agreed price, member assignments, scoped reads, explicit authorized completion, versions |
| Money | `apps/api/src/expenses.ts` | Business-only MXN, current user payer, missing-receipt reason, submission/review; approval is not payment |
| Shared types and validation | `packages/core/src/index.ts` | Permission/action strings, DTOs, currency and amount limits, UUID/version/input rules |
| Persistence | `apps/api/src/database.ts`, `db/migrations/001_work_money.sql` | PostgreSQL pool adapter; PGlite test/demo adapter; versioned checked migration, tenant RLS, audit immutability |
| Demo fixture isolation | `apps/api/src/demo.ts`, `demo-fixtures.ts` | Fictional ephemeral data, fixed loopback/host/origin checks; never seeded by real migration/server |
| Database setup boundary | `db/README.md`, `.env.example`, `compose.yaml` | Migration vs runtime grants; isolated local Compose only, not run in this task |
| Backend verification | `apps/api/test/backend.test.ts` | 12 substantive scenarios including full API under restricted DB role in PGlite |
| UI verification | `tests/e2e/work-money.spec.ts`, `playwright.config.ts` | Connected desktop/mobile workflows, response-loss retry, conflicts, revocation, setup gate |
| Offline verification | `packages/offline/test`, `tests/offline`, `playwright.offline.config.ts` | Queue failure cases and real browser offline reload/reconnect tests; native runtime separate |

## What is deliberately absent from this slice

No real sign-in/onboarding or permission-management UI; no deployed database; no private receipt store or OCR; no normal receipt-present/direct-posting flow; no reimbursement, payment, cash ledger, receivable/payable or actual profit calculations; no quote acceptance, CRM pipeline, time entry, trips, scheduling or inventory. Job creation supports basic assignments, not complete Resources. No legacy data imports, shared-backend changes, remote Git publication or cutover occurred.

These are still product requirements, and the roadmap tracks them. Do not mark a requirement fulfilled merely because a related type, menu label, test fixture or proposed schema exists.

## Next technical integration boundary

Implement verified identity/onboarding and membership/grant administration, then private receipt capture with the confirmed approval rules. Before real money records, implement explicit obligations, settlements and partial allocations with correction semantics and multi-connection PostgreSQL tests. Validate the current real business workflow and the unresolved quote/job/inventory decisions when the dependent feature is built. The canonical roadmap explains sequencing; do not infer the user has dropped any required area.
