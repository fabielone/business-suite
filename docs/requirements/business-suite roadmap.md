---
tags: [business-suite, roadmap, status]
updated: 2026-10-24
---
# Business Suite roadmap

← [business-suite hub](<business-suite hub.md>) · [business-suite requirements](<business-suite requirements.md>) · [business-suite quality and verification](<business-suite quality and verification.md>)

This roadmap sequences implementation without removing confirmed scope. Jobs, assignments, trips, time, receipts, expenses, income, balances, reimbursements, optional CRM/quotes/site visits and professional integrations remain part of the intended product. The exact first pilot remains open; approximately five test users is context, not a technical capacity ceiling.

## Current authorized work
NOTE-011 (Obsidian reference) is the current licensing/public-source task. On 2026-10-24 the human authorized a public repository with attribution, forks and contributions, retaining official merge/release control. AGPL-3.0-only is selected for original project work; repository publication verification remains in progress. See [business-suite open source and contributions](<business-suite open source and contributions.md>).

NOTE-010 (Obsidian reference) owns the completed development-deployment and initial private-upload acceptance evidence. On2026-10-24 the human explicitly requested use of the existing shared Docker host and a GitHub upload. The additive development backend is running; final verification/publication evidence is tracked in that task and [business-suite deployed backend](<business-suite deployed backend.md>). This does not authorize legacy deletion, operational data migration or an automatic client cutover.

NOTE-009 completed the bounded local Windows/macOS foundation; its historical platform limitations below remain valid.

NOTE-007 completed the bounded local foundation at `/Users/fabiel/Desktop/business-suite`, checkpoint `fd6b5ef`, with evidence preserved below and in its report. NOTE-008 completed the scoped offline/mobile extension; NOTE-009 starts from clean checkpoint `0a71454`. Historical interview delivery/status and NOTE-007/008 results do not certify the new desktop work. Desktop package/runtime/signing evidence must be recorded separately.

## Historical foundation scope from E1
The bounded first slice is a React/Vite frontend, Fastify/TypeScript API, shared core, PostgreSQL migrations and a loopback local PGlite demo. It includes authorized job list/create/close, field-level price projection, expense list/submit/review, missing-receipt reason, authenticated payer, conservative self-approval denial, version checks and idempotency contracts. Real API JWT/membership validation is a backend boundary; initial web sign-in UX is not included.

No real receipt upload, actual reimbursement/payment, timer, trip, full CRM, Resource scheduling, food batch, production deployment or complete replacement is promised by that slice. Those omissions are implementation sequencing. Documentation must label screens and endpoints accordingly.

## Delivery stages and decision dependencies
| Stage | Outcome | Dependencies and boundary |
|---|---|---|
| Foundation | Runnable local slice with meaningful denied/error/retry paths and responsive UI | E1; actual commands and UI checks required; PGlite is not real PostgreSQL certification |
| Offline and native foundation | Durable supported-command capture/replay, cached work, browser shell/IndexedDB and Android/iOS SQLite clients with shared semantics | NOTE-008 historical scoped result; expense submit/job close only; no full offline-product or device-readiness claim |
| Windows and macOS foundation | Packaged React desktop shell, persistent IndexedDB profile and same sync rules through isolated Electron bridge | Current NOTE-009; exact OS/architecture/runtime and release evidence recorded separately |
| Real-use safety | Verified real auth UX, offline session/local-data privacy, PostgreSQL roles/isolation/concurrency, durable evidence storage, backup/restore and environment separation | Pilot/data/privacy decisions; no real-money pilot before relevant controls |
| Complete worker-money loop | Business/personal split, receipt and missing-receipt rules, privileged direct posting, employee balances, grouped partial reimbursement, customer receipts/remaining due | Self-approval/payment authority, advances, balance creation, cash/transfer policies; preserve agreed price |
| Work and Resources depth | Assignments, timers/manual time, man-hours, trips, vehicles/equipment, meaningful completion/correction history | Conflict, time review, resource availability and location/privacy decisions |
| Commercial and pilot depth | Optional light CRM, site visits, quotes/acceptance, typed accepted commitments and their work/fulfillment | Quote acceptance/hierarchy; implement physical/food/professional-service variation based on chosen pilot |
| Industry variation | Physical stages/materials/purchases; food recipes/portion orders/shared batches; recurring/service patterns | Materials/stock, recurrence and reporting decisions; no compulsory heavy workflow for tiny operators |
| Professional connectors and migration | Controlled accounting/payroll/fiscal/payment integration; rehearsed CRM/Cocina/Salad successor mappings | Provider/authority selection, reconciliation, import/retention and explicit cutover authorization |
| Measured growth | Deeper org/entity/site controls, performance and availability based on representative workloads | Scale dimensions measured separately; no automatic enterprise claim |

These stages describe dependencies, not fixed calendar estimates or a demand that the user rank all important requirements again. Work on independent documentation or safe foundations can continue while open product policies are resolved. The order between later work/resource and money capabilities can be adjusted to the selected pilot without cancelling either.

## Decisions needed before behavior depends on them
First clarify the operational pilot, quote acceptance, job/project hierarchy, recurrence, materials/inventory depth and scheduling conflicts. For real money, settle self-approval, separate direct-post/reimbursement/payment grants, mixed funding/advances, obligation creation and cash/transfer evidence. Before personal data collection, settle privacy/retention, tracking and role/field visibility. The original-project license policy is resolved by NOTE-011; brand, production hosting, external providers and future distribution compatibility remain open.

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

**Limits:** Shared engine tests use a serialized JSON adapter; API uses PGlite, not real PostgreSQL concurrency. Native source/type/bundles are verified, but no Expo Go/development client was installed on a simulator and no native UI, actual SQLite runtime, OS termination, physical device, Xcode/Gradle binary, signing or store distribution was tested. Native setup is deliberately simulator-only fictional demo; actual devices/live mode remain setup-only until real auth/service configuration/local privacy controls exist. Browser storage is subject to browser eviction; offline onboarding, encryption/retention, durable receipt blobs, full sync recovery/migrations and all remaining workflows require implementation. At the NOTE-008 handoff desktop priority was unanswered; NOTE-009 subsequently confirmed Windows/macOS for current delivery. No deployment, legacy migration, remote push or shared-backend changes.

**Dependency finding:** `npm audit` reports5 high entries in the Expo development-toolchain dependency tree, driven by [node-forge signature verification](https://github.com/advisories/GHSA-86w9-cpqp-85rv) and [Zod oversized collections](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). Registry inspection found node-forge1.4.0 still latest; Expo CLI uses Zod3.25.76 while the advisory's fixed version is4.6.6+. No forced major downgrade/override was applied. Resolve/review these before release or enabling signing/update workflows; passing functional checks is not release security clearance. The initial Node25 unsupported-engine warnings were resolved for final checks by using supported Node22; the initial TypeScript5.9 compatibility recommendation was resolved by aligning all workspaces to6.0.3. One npm-exec wrapper invocation failed with usage help and was corrected; the actual Expo dependency check passed.

Run `npm run demo:offline` for the built browser demo; run `npm run mobile:demo` alongside the API for the native development entry. Read [offline contract](/Users/fabiel/Desktop/business-suite/docs/offline-contract.md) and [native instructions](/Users/fabiel/Desktop/business-suite/apps/mobile/README.md). These results complete the scoped local extension, not the full business replacement.

Report: NOTE-008 2026-10-23 Offline and native foundation report (Obsidian reference). Portable repository requirements are refreshed from the canonical notes after these edits.

## NOTE-009 desktop foundation — 2026-10-24
The coordinating agent reports the following verified local results on **macOS 27.0.1 arm64**, with Electron **45.0.0** and electron-builder **26.18.0**. These results describe the supported-host foundation, not a Windows installer/runtime pass or a production release. [business-suite desktop applications](<business-suite desktop applications.md>) defines the full contract; [desktop README](/Users/fabiel/Desktop/business-suite/apps/desktop/README.md) records source paths and local modes.

| Evidence | Result and practical limit |
|---|---|
| Workspace checks | All-workspace type checking passes; **38 unit/API scenarios** pass: 16 offline, 12 API, 2 mobile parsing and 8 desktop bridge/security |
| Actual macOS Electron runtime | **3 tests pass** against the staged app: bundled UI, offline persistence/reconnect and setup-mode isolation |
| Renderer/bridge | Sandboxed/context-isolated renderer; frozen three-field bridge (`platform`, `mode`, `request`); no Node globals; invalid IPC, CSP, windows/navigation checks pass |
| Mode isolation | Setup artifact refuses API use even with `--demo`; explicit fictional demo is separate; no live fallback |
| Offline lifecycle | Two queued intents survive actual app quit/relaunch with the same IDs, API generation and account isolation; reconnection produces one accepted server effect per intent in the tested flow |
| Navigation correction | Same-document skip-link hash is allowed without widening permitted origin/path/frame access; focused runtime checks pass |
| macOS package artifacts | arm64 demo DMG and ZIP generated under `apps/desktop/artifacts/demo`; unsigned and not notarized |
| Packaged macOS launch | Actual demo `.app` launches with no API/web server; `isPackaged=true`, `suite://app/`, demo mode, no Node globals; correctly shows connect-once empty-offline state. This is not a DMG installation walkthrough |
| Windows package target | x64 application and ZIP produced; ZIP CRC verified and executable identified as PE32+ x86-64. No actual Windows runtime tested |
| Windows NSIS installer | **Build failed** with `spawn error -86`: the bundled `makensis` is a Mach-O x86_64 executable that cannot run on this ARM host as configured. No Rosetta/system installation was performed. NSIS target and manual Windows CI workflow are provided; workflow has not run |
| Browser regression/build | All 8 connected plus 2 built-shell offline regressions pass; format check, build and default/demo builds pass. These are the final NOTE-009 runs |
| Release/lifecycle gaps | Real auth/local privacy, full workflows, Windows runtime, signing/notarization, upgrades, uninstall/profile recovery and public distribution remain unverified |
| Artifact integrity | macOS DMG checksum and both macOS/Windows ZIP CRC checks pass; integrity checks do not establish signing or runtime compatibility |
| Dependency audit | Five known high Expo development-toolchain findings remain, as in NOTE-008; no release-security clearance implied |
| Portable requirements | Root exported17 finalized canonical notes into `docs/requirements`; source hashes and export time recorded in `snapshot.json` |

The application bundles React assets at `suite://app/` and uses persistent app-controlled IndexedDB plus the existing shared offline engine. The main-process bridge is fixed to loopback demo transport. Mobile remains React Native/SQLite; no mobile runtime claim is added here. Existing NOTE-007/008 reports stay historical.

**Built fictional-demo artifacts:** [macOS arm64 DMG](</Users/fabiel/Desktop/business-suite/apps/desktop/artifacts/demo/Business Suite Demo-0.1.0-mac-arm64.dmg>), [macOS arm64 ZIP](</Users/fabiel/Desktop/business-suite/apps/desktop/artifacts/demo/Business Suite Demo-0.1.0-mac-arm64.zip>), [Windows x64 ZIP](</Users/fabiel/Desktop/business-suite/apps/desktop/artifacts/demo/Business Suite Demo-0.1.0-win-x64.zip>). They are unsigned local artifacts, not public releases.

The evidence supports the scoped local desktop foundation on the supported Mac host. It does **not** establish a working NSIS installer, Windows runtime, macOS DMG installation walkthrough, signing/notarization or full product readiness. Delivery remains idempotent retry with reconciliation; the tested one-effect-per-intent behavior is not a general exactly-once network guarantee.

## Completion and future handoff
The local foundation is complete only to the extent supported by the separate NOTE-007, NOTE-008 and NOTE-009 acceptance evidence. Larger product completion remains outstanding. A successor agent reads [business-suite sources and agent handoff](<business-suite sources and agent handoff.md>), chooses an authorized task, inspects current code and fills the relevant feature contract before changing behavior. No feature is deemed finished merely because it appears in this roadmap.

NOTE-009 final report: NOTE-009 2026-10-24 Desktop application foundation report (Obsidian reference). Its scoped local completion includes explicit Windows installer/runtime and release gaps; it does not certify the full suite.

## NOTE-010 backend and publication — 2026-10-24
Independent Suite database/Auth/API is deployed on the existing Docker host and source is uploaded to private GitHub.38 existing tests,9 real PostgreSQL groups,12 operator/adapter tests and8 deployed Auth/API groups passed; full backup and bounded schema restore succeeded; synthetic fixtures removed and peers preserved. NOTE-010 2026-10-24 Backend deployment and GitHub report (Obsidian reference) records commits, exact evidence and limits. Hosted push/manual CI reports startup_failure before jobs despite actionlint-valid workflows; exact cause is unresolved. Real client login, offline session/privacy, production operations and full product/cutover remain incomplete.

## NOTE-011 licensing and public-source release — 2026-10-24
The human authorizes a public repository with attribution, independent forks and pull requests, retaining control of official merges/releases. AGPL-3.0-only is the selected original-project license; contributor ownership and preserved third-party terms are in [business-suite open source and contributions](<business-suite open source and contributions.md>). Source/history review, repository license installation, commit/push and public-visibility verification remain in progress in NOTE-011 License and publicly release Business Suite (Obsidian reference). This updates source distribution policy without claiming new business features, production readiness, real client login, public binary releases or deployment changes.
