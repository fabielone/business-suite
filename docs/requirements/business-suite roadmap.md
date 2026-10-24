---
tags: [business-suite, roadmap, status]
updated: 2026-10-23
---
# Business Suite roadmap

← [business-suite hub](<business-suite hub.md>) · [business-suite requirements](<business-suite requirements.md>) · [business-suite quality and verification](<business-suite quality and verification.md>)

This roadmap sequences implementation without removing confirmed scope. Jobs, assignments, trips, time, receipts, expenses, income, balances, reimbursements, optional CRM/quotes/site visits and professional integrations remain part of the intended product. The exact first pilot remains open; approximately five test users is context, not a technical capacity ceiling.

## Current authorized work
NOTE-008 (Obsidian reference) now owns the active acceptance criteria, execution checklist and status. The human requires offline-first operation and multiplatform native clients, superseding web-first/native-later. Android/iOS/browser are assumed while desktop native priority remains open. NOTE-008 authorizes the local offline/native extension, not production deployment, remote publication, purchases, migration, legacy deletion or shared backend changes.

NOTE-007 completed the bounded local foundation at `/Users/fabiel/Desktop/business-suite`, checkpoint `fd6b5ef`, with evidence preserved below and in its report. NOTE-008 builds on that baseline. Historical interview delivery/status and NOTE-007 results do not override the later requirement or certify the new offline/native work. Source inspection of the shared offline client is recorded separately from pending runtime/device evidence.

## Historical foundation scope from E1
The bounded first slice is a React/Vite frontend, Fastify/TypeScript API, shared core, PostgreSQL migrations and a loopback local PGlite demo. It includes authorized job list/create/close, field-level price projection, expense list/submit/review, missing-receipt reason, authenticated payer, conservative self-approval denial, version checks and idempotency contracts. Real API JWT/membership validation is a backend boundary; initial web sign-in UX is not included.

No real receipt upload, actual reimbursement/payment, timer, trip, full CRM, Resource scheduling, food batch, production deployment or complete replacement is promised by that slice. Those omissions are implementation sequencing. Documentation must label screens and endpoints accordingly.

## Delivery stages and decision dependencies
| Stage | Outcome | Dependencies and boundary |
|---|---|---|
| Foundation | Runnable local slice with meaningful denied/error/retry paths and responsive UI | E1; actual commands and UI checks required; PGlite is not real PostgreSQL certification |
| Offline and native foundation | Durable supported-command capture/replay, cached work, browser shell/IndexedDB and Android/iOS SQLite clients with shared semantics | Current NOTE-008; expense submit/job close only; create/review online; no full offline-product or device-readiness claim |
| Real-use safety | Verified real auth UX, offline session/local-data privacy, PostgreSQL roles/isolation/concurrency, durable evidence storage, backup/restore and environment separation | Pilot/data/privacy decisions; no real-money pilot before relevant controls |
| Complete worker-money loop | Business/personal split, receipt and missing-receipt rules, privileged direct posting, employee balances, grouped partial reimbursement, customer receipts/remaining due | Self-approval/payment authority, advances, balance creation, cash/transfer policies; preserve agreed price |
| Work and Resources depth | Assignments, timers/manual time, man-hours, trips, vehicles/equipment, meaningful completion/correction history | Conflict, time review, resource availability and location/privacy decisions |
| Commercial and pilot depth | Optional light CRM, site visits, quotes/acceptance, typed accepted commitments and their work/fulfillment | Quote acceptance/hierarchy; implement physical/food/professional-service variation based on chosen pilot |
| Industry variation | Physical stages/materials/purchases; food recipes/portion orders/shared batches; recurring/service patterns | Materials/stock, recurrence and reporting decisions; no compulsory heavy workflow for tiny operators |
| Professional connectors and migration | Controlled accounting/payroll/fiscal/payment integration; rehearsed CRM/Cocina/Salad successor mappings | Provider/authority selection, reconciliation, import/retention and explicit cutover authorization |
| Measured growth | Deeper org/entity/site controls, performance and availability based on representative workloads | Scale dimensions measured separately; no automatic enterprise claim |

These stages describe dependencies, not fixed calendar estimates or a demand that the user rank all important requirements again. Work on independent documentation or safe foundations can continue while open product policies are resolved. The order between later work/resource and money capabilities can be adjusted to the selected pilot without cancelling either.

## Decisions needed before behavior depends on them
First clarify the operational pilot, quote acceptance, job/project hierarchy, recurrence, materials/inventory depth and scheduling conflicts. For real money, settle self-approval, separate direct-post/reimbursement/payment grants, mixed funding/advances, obligation creation and cash/transfer evidence. Before personal data collection, settle privacy/retention, tracking and role/field visibility. License, brand, hosting and external providers remain open.

[business-suite open decisions](<business-suite open decisions.md>) owns exact decision IDs and wording. Do not resolve these through demo behavior, a database default or a speculative provider integration.

## Actual implementation evidence
Coordinating root verified the following on 2026-10-23. Detailed evidence: NOTE-007 2026-10-23 Business Suite foundation report (Obsidian reference) and [repository verification](/Users/fabiel/Desktop/business-suite/docs/verification.md).

| Evidence | Verified result and limit |
|---|---|
| Repository | `/Users/fabiel/Desktop/business-suite`, branch `main`; final commit/dirty state recorded in the task report |
| Screens | `/` hosts Overview, Work list/detail/create/complete and Money list/submit/review with in-app view state. `apps/web/src/App.tsx` and `api.ts`; no complete route/deep-link system yet |
| API/schema | `apps/api/src/{app,auth,context,jobs,expenses,database,server}.ts`, shared core and `db/migrations/001_work_money.sql`; actual source map linked below |
| Permissions | Server-side active business/member/module/action/record checks, worker price redaction, server-controlled payer, conservative self-approval denial; real JWT mode ignores demo/role headers |
| Commands | Version checks; transaction-bound normalized idempotency and audit; constraints and tenant RLS; tests include restricted-runtime-role API commands in PGlite |
| Automated checks | `npm run check`, `npm test` (11 passed), `npm run build`, `npm run test:e2e` (8 passed), plus a focused final layout rerun |
| UI evidence | Chromium1440×1000 desktop and390×844 phone screenshots inspected;320px width overflow checked. Worker completion, expense review, response-loss retry, stale data and conflict recovery exercised |
| Demo | `npm ci` then `npm run demo`; web127.0.0.1:5178/API4310. Explicit ephemeral fictional data, resets on restart; no real uploads/payments |
| Default/real mode | Default web build shows setup-only screen; real API exits when auth is absent and rejects owner/bypass DB roles. Actual auth-provider integration remains unverified |
| Portable requirements | `docs/requirements` generated from these finalized notes; `snapshot.json` records source hashes and export time. Canonical requirements remain here |
| Remaining verification | Docker/real PostgreSQL server, actual pooling/concurrency, backups/restore, real sign-in, receipts, external integrations and deployment unrun |
| Replacement status | No legacy deletion, data import, endpoint retargeting, new Salad consumer, remote push or production cutover |

Source inventory: [docs/source-map.md](/Users/fabiel/Desktop/business-suite/docs/source-map.md). Starter examples use only MXN and missing-receipt submissions. They do not fulfill the entire Money/Work/CRM/Resources scope.

## NOTE-008 offline/native foundation — 2026-10-23

**Implemented:** Android/iOS React Native + Expo source (`apps/mobile`), native SQLite adapter, browser IndexedDB adapter and generated offline shell, shared durable command queue (`packages/offline`), API demo-generation guard and16 revised product notes. Supported offline capture is missing-receipt expense submission and job-completion requests. Confirmed work remains readable after a prepared browser is disconnected/reopened. Queued work is visibly separate from confirmed work and never treated as approved/paid. Initial job creation/expense review remain online in the browser; remaining modules are still outstanding.

**Checks passed:** Node22.23.4, TypeScript6.0.3; `npm run check`; `npm test` (16 shared queue +12 API +2 native money parsing tests); `npm run build`; `npm run build:mobile` and `npm run build:mobile:demo` (Android+iOS Hermes exports in both modes); `expo install --check` (dependencies up to date); `npm run test:e2e` (8 connected Chromium flows); `npm run test:offline` (2 built-shell offline/reconnect scenarios); formatting and Git whitespace checks. Desktop and390px offline screenshots were inspected;320px browser overflow was checked. Screenshot: [offline phone](/Users/fabiel/Desktop/business-suite/docs/preview/offline-phone.png).

**Meaningful failure coverage:** save-before-send; lost server response and local acknowledgement failure retain the same key; concurrent captures; account/business isolation; malformed persisted paths/bodies cannot replay arbitrary commands; stale versions remain conflicts; denial clears protected snapshots and locks replay; new demo generation blocks old requests; late acknowledgements cannot repopulate reset local state. Browser tests disconnect, reload, save, reload again and reconnect to exactly one server expense; pending completion does not show as confirmed. Service-worker cache contains no API responses.

**Limits:** Shared engine tests use a serialized JSON adapter; API uses PGlite, not real PostgreSQL concurrency. Native source/type/bundles are verified, but no Expo Go/development client was installed on a simulator and no native UI, actual SQLite runtime, OS termination, physical device, Xcode/Gradle binary, signing or store distribution was tested. Native setup is deliberately simulator-only fictional demo; actual devices/live mode remain setup-only until real auth/service configuration/local privacy controls exist. Browser storage is subject to browser eviction; offline onboarding, encryption/retention, durable receipt blobs, full sync recovery/migrations and all remaining workflows require implementation. Windows/macOS installable clients remain an unanswered packaging priority. No deployment, legacy migration, remote push or shared-backend changes.

**Dependency finding:** `npm audit` reports5 high entries in the Expo development-toolchain dependency tree, driven by [node-forge signature verification](https://github.com/advisories/GHSA-86w9-cpqp-85rv) and [Zod oversized collections](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). Registry inspection found node-forge1.4.0 still latest; Expo CLI uses Zod3.25.76 while the advisory's fixed version is4.6.6+. No forced major downgrade/override was applied. Resolve/review these before release or enabling signing/update workflows; passing functional checks is not release security clearance. The initial Node25 unsupported-engine warnings were resolved for final checks by using supported Node22; the initial TypeScript5.9 compatibility recommendation was resolved by aligning all workspaces to6.0.3. One npm-exec wrapper invocation failed with usage help and was corrected; the actual Expo dependency check passed.

Run `npm run demo:offline` for the built browser demo; run `npm run mobile:demo` alongside the API for the native development entry. Read [offline contract](/Users/fabiel/Desktop/business-suite/docs/offline-contract.md) and [native instructions](/Users/fabiel/Desktop/business-suite/apps/mobile/README.md). These results complete the scoped local extension, not the full business replacement.

Report: NOTE-008 2026-10-23 Offline and native foundation report (Obsidian reference). Portable repository requirements are refreshed from the canonical notes after these edits.

## Completion and future handoff
The foundation is complete only to the extent supported by NOTE-007 acceptance evidence. Larger product completion remains outstanding. A successor agent reads [business-suite sources and agent handoff](<business-suite sources and agent handoff.md>), chooses an authorized task, inspects current code and fills the relevant feature contract before changing behavior. No feature is deemed finished merely because it appears in this roadmap.
