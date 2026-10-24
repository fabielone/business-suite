---
tags: [business-suite, documentation, handoff]
updated: 2026-10-24
---
# Business Suite sources and agent handoff

← [business-suite hub](<business-suite hub.md>) · [business-suite requirements](<business-suite requirements.md>) · [business-suite roadmap](<business-suite roadmap.md>)

This note records provenance and the reading order for agents. The vault specifications are the maintained product requirements. The repository's initial contract controls the bounded initial implementation; a dated portable copy is provided in repository `docs/requirements`, with source hashes in `snapshot.json`. Preserve the distinction between a historical interview snapshot, current human direction, design proposal and verified code.

## Source inventory
| Key | Source | How to use it |
|---|---|---|
| H-PRIOR | Earlier human conversation about CRM/JobQ/Costs, light sales pipeline, quotes/site visits, worker/resource allocation, man-hours, Insignia signage, six-person meal service, Mexico then abroad, modular open source, large-business growth and professional integrations | Confirmed broad human direction; precise workflow/provider/policy details remain open |
| H-20261023 | Human authorization recorded in NOTE-007 (Obsidian reference) | Extensive Obsidian requirements, new Desktop repository and initial implementation; eventual CRM/Cocina replacement |
| H-OFF-20261023 | Human clarification recorded in NOTE-008 (Obsidian reference) | Offline-first because of unreliable connectivity; multiplatform native apps required now; supersedes web-first/native-later |
| H-DESK-20261024 | Later human answer recorded in NOTE-009 (Obsidian reference) | Explicitly include Windows and macOS desktop apps now; resolves BS-DEC-025 |
| I1 | [Canonical discovery JSON](/Users/fabiel/Documents/ChatGPT/workflow/planning/product-discovery.json) | Dated interview answers and unresolved decisions; status remains interview in progress |
| I2 | [Repository interview snapshot](/Users/fabiel/Desktop/business-suite/docs/interview-snapshot.json) | Portable historical evidence; do not silently treat it as later implementation status |
| E1 | [Initial implementation contract](/Users/fabiel/Desktop/business-suite/docs/implementation-contract.md) | Bounded foundation stack/API/modes; read current amendments, not a complete product or test report |
| E2 | [Shared offline client source](/Users/fabiel/Desktop/business-suite/packages/offline/src/index.ts) | Source inspected 2026-10-23: demo-only queue/state/replay contract; adapter/device/runtime evidence requires root verification |
| D1 | [Expo local-first](https://docs.expo.dev/guides/local-first/), [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/), [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), [MDN Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) | Primary mechanism documentation read 2026-10-23; supports storage/architecture choices, not project readiness |
| R1 | [Architecture for a modular business platform](</Users/fabiel/Documents/ChatGPT/workflow/reports/Architecture for a modular business platform.md>) | Supporting greenfield design mechanisms and private-note evidence limits |
| R2 | [Modular open source business systems](</Users/fabiel/Documents/ChatGPT/workflow/reports/Modular open source business systems.md>) | Background mechanisms/tradeoffs; user later chose greenfield, so ERP adoption is not the current recommendation |
| R3 | [A shared small business operating system](</Users/fabiel/Documents/ChatGPT/workflow/reports/A shared small business operating system.md>) | Original shared-order/work/money reasoning, food/signage variation and management reporting distinctions |
| V1 | [Vault AGENTS.md](../AGENTS.md), _management/Agent handbook (Obsidian reference), _templates/App documentation contract (Obsidian reference) | Required documentation/task/evidence procedures |
| V2 | _management/integration register (Obsidian reference), crm/crm hub (Obsidian reference), cocinacostos/cocinacostos hub (Obsidian reference), cocinacostos/cocinacostos salad.mx integration (Obsidian reference), salad.mx/salad.mx hub (Obsidian reference) | Existing authority, integration history and pending evidence; do not reinterpret all historical claims as fresh verification |
| C1 | [Repository AGENTS.md](/Users/fabiel/Desktop/business-suite/AGENTS.md) | Read before code changes; current task defines ownership boundaries |
| D2 | [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [protocol](https://www.electronjs.org/docs/latest/api/protocol), [app paths](https://www.electronjs.org/docs/latest/api/app#appgetpathname), [updates](https://www.electronjs.org/docs/latest/tutorial/updates), [signing](https://www.electronjs.org/docs/latest/tutorial/code-signing) | Primary mechanisms read 2026-10-24; supports desktop design, not application runtime/release certification |

H-PRIOR is conversation provenance rather than a verbatim independent transcript saved by this pass. Reports summarize it but do not turn every report recommendation into a user decision. If a precise disputed requirement cannot be established, keep its policy open and ask through the coordinating agent rather than fabricate an answer.

## Precedence and status rules
Later direct human instructions outrank older summaries. Confirmed requirements outrank implementer convenience. Engineering defaults can safely bound a local prototype, but must not silently settle an unanswered product policy. Research supplies mechanisms and recommendations, not evidence that the new repository implements them or a universal market promise.

Use stable IDs in [business-suite requirements](<business-suite requirements.md>), decision IDs in [business-suite open decisions](<business-suite open decisions.md>), architecture IDs in [business-suite architecture](<business-suite architecture.md>), screen IDs in [business-suite screens and flows](<business-suite screens and flows.md>) and scenario IDs in [business-suite quality and verification](<business-suite quality and verification.md>). Do not recycle IDs. Mark supersession with date/source and update dependent notes rather than copying competing versions.

The small demo does not cancel trips, time, assignments, resource allocation, money in/out, light CRM, quotations/site visits, receipts, reimbursements or professional integrations. Current work's lack of sales pipeline means optional activation, not deletion of CRM scope. Six people eating does not necessarily mean six paying customers. The five-person test group does not resolve the pilot or capacity requirements.

## Agent reading order
1. Vault AGENTS and Agent handbook; current task ownership/status and canonical checklist.
2. [business-suite hub](<business-suite hub.md>), [business-suite requirements](<business-suite requirements.md>) and [business-suite open decisions](<business-suite open decisions.md>).
3. [business-suite offline and multiplatform](<business-suite offline and multiplatform.md>), [business-suite desktop applications](<business-suite desktop applications.md>), then feature-specific workflow, money, permission, data and screen notes.
4. Repository AGENTS, current implementation contract, interview snapshot and actual code/migrations/tests.
5. [business-suite migration](<business-suite migration.md>) and existing source integration contract before touching a legacy interface.
6. Current root report/evidence in [business-suite roadmap](<business-suite roadmap.md>) before claiming implementation or deployment.

Inspect code before assigning exact routes/tables/guards or changing them. The source dictionary is conceptual where marked proposed. Link implementation paths and executed test results after work, and leave unrun checks visible.

## Historical NOTE-007 ownership
The documentation agent exclusively owns the new vault `business-suite/` folder. Root owns shared vault task/index/report/legacy links and repository integration, installs and lockfile. Backend and frontend agents own their assigned code paths. Do not modify another agent's files or overwrite concurrent changes without coordination. Root will copy finalized requirements into `docs/requirements`; maintain one authoritative specification and record the copy date/source instead of silently forking it.

This documentation pass wrote only the new folder. No repository implementation, source-data migration, remote Git publication, shared backend provision or Page write is performed by the docs agent.

## Where root should add final evidence
- [business-suite roadmap](<business-suite roadmap.md#actual-implementation-evidence>): exact branch/commit/status, files, executed checks, UI evidence, limitations and report link.
- [business-suite quality and verification](<business-suite quality and verification.md#final-evidence-insertion-point>): actual result scope/environment and unrun checks.
- [business-suite screens and flows](<business-suite screens and flows.md#evidence-slots>): observed route/component inventory and responsive/accessibility evidence, or link to the final report.
- [business-suite hub](<business-suite hub.md>): replace the handoff evidence paragraph with concise verified current state and link.
- [business-suite API and integrations](<business-suite API and integrations.md>) and [business-suite data model](<business-suite data model.md>): only reconcile meaningful implemented-contract differences after code inspection; do not mark future endpoints/entities implemented.

The current canonical acceptance checklist is in NOTE-010; NOTE-007/008/009 keep historical foundation evidence. Do not create a second checkbox list here. Root should update shared app-documentation coverage, task/board/report and legacy direction links according to vault procedure.

## Material known gaps
Exact brand/license, final pilot, quote acceptance, job hierarchy, recurrence, material/stock policy, schedule conflicts, pending-cost reporting, employee advances, self-approval/payment separation, privacy/retention/location use, invitations/grant policy, offline policy details/desktop OS-architecture and release policy, professional providers, opening balances and cutover remain unresolved. Local legacy repository existence and deployment details need fresh inspection when authorized. All are tracked with specific IDs in [business-suite open decisions](<business-suite open decisions.md>), not assumptions to fill from generic ERP conventions.


### NOTE-007 final handoff — 2026-10-23
The coordinating agent completed the scoped local foundation; task/report and actual code map are the resume points. Initial session path allocations above are historical once NOTE-007 is Done, not permanent locks. A successor claims a new authorized task, reads current code/status, and can work within that new scope without needing the old agents to remain present. Canonical product notes stay in Obsidian; export copies only after coordinating current writes.

Implementation map: [docs/source-map.md](/Users/fabiel/Desktop/business-suite/docs/source-map.md). Run guide: [docs/local-development.md](/Users/fabiel/Desktop/business-suite/docs/local-development.md). Checks: [docs/verification.md](/Users/fabiel/Desktop/business-suite/docs/verification.md). Current task report: NOTE-007 2026-10-23 Business Suite foundation report (Obsidian reference).

## NOTE-008 historical ownership and handoff
Root owns shared offline package, web integration, package/lockfile, browser tests and shared task/report/index coordination; native agent owns `apps/mobile`; API/test agent owns `apps/api` and assigned review/tests; this documentation agent owns only the vault `business-suite/` notes. These were NOTE-008 allocations and ended with that task; they are not permanent locks. Read the current task metadata before edits.

Offline-first/native delivery was confirmed in NOTE-008; NOTE-009 later explicitly included Windows/macOS now alongside Android/iOS/browser. Desktop inclusion is no longer open. Historical reports and interview snapshots stay intact. Do not resurrect web-first/native-later from an old report, or interpret the two-command demo queue as full offline product completion.

NOTE-008 final evidence is now preserved in [business-suite roadmap](<business-suite roadmap.md>) and its report. For subsequent changes, root updates the corresponding current-task evidence and refreshes the portable `docs/requirements` copy/hash manifest after docs writes finish. Preserve NOTE-007's actual evidence as dated history. No live data, provider connection, deployment, native signing/store publication or legacy migration is authorized by these note updates.

## NOTE-008 continuation handoff
Read NOTE-008 2026-10-23 Offline and native foundation report (Obsidian reference), `docs/offline-contract.md` and `apps/mobile/README.md` before extending clients. Offline-first native delivery supersedes the historical interview snapshot. Native/runtime/live-auth verification and dependency-advisory remediation are the next technical boundaries; no full product completion or automatic new assignment follows from this handoff. Current task edit ownership is released on completion.

## NOTE-009 ownership and evidence handoff
During NOTE-009, desktop implementation owned `apps/desktop` except tests; desktop test/review owned `apps/desktop/test` and `tests/desktop`; root owned web integration, shared scripts/config/lockfile and task/report/index coordination; documentation owned only `business-suite/` vault notes. These assignments are released at completion and are not permanent locks. Future agents read the current task and claim their own authorized scope.

Both Windows and macOS are required now. Electron is an engineering choice using the React interface/shared sync and app-controlled persistent IndexedDB; mobile remains React Native/SQLite. OS versions/architectures, installer/update/signing and local-data lifecycle policy are not automatically settled by that choice.

Root should add actual desktop paths/artifacts/runtime/security checks and unrun signing/platform checks at [business-suite roadmap](<business-suite roadmap.md#note-009-desktop-foundation--2026-10-24>), link the dated report and refresh the portable requirements. Preserve NOTE-007/008 reports as history. No production readiness, remote publication, credential purchase, legacy migration or unrelated backend change follows from these notes.

## NOTE-009 final canonical evidence handoff
Root supplied the final local verification: 38 unit/API tests, 3 staged macOS Electron runtime tests, actual packaged Mac shell smoke, 10 browser regressions, type/build/default-demo/format checks and artifact integrity checks. Canonical results are reconciled under [business-suite roadmap](<business-suite roadmap.md#note-009-desktop-foundation--2026-10-24>), with desktop/API/screen/quality notes matching the bounded claims.

Mac demo DMG/ZIP and Windows x64 ZIP exist as unsigned local artifacts. Windows NSIS failed because its x86_64 Mach-O `makensis` would not execute on the ARM host; no Rosetta/system install or Windows CI/runtime occurred. Five known Expo development-toolchain advisories and live auth/local privacy, update/uninstall/recovery/signing gaps remain. Root owns final report/index/task updates and portable-note export; this documentation pass changed only canonical project notes and did not export.

NOTE-009 local scope is complete with explicit platform/release limits. See NOTE-009 2026-10-24 Desktop application foundation report (Obsidian reference) for final checks, artifacts, hashes and repository commit. Root exported17 canonical notes and reconciled the shared indexes; source hashes are in `docs/requirements/snapshot.json`.

## NOTE-010 shared backend handoff — 2026-10-24
The human authorized isolated shared-Docker deployment and GitHub publication. [business-suite deployed backend](<business-suite deployed backend.md>) names actual runtime routes, roles, source and remaining client boundaries. Read NOTE-010 Deploy Business Suite backend and publish repository (Obsidian reference) and its report before operations. The Suite repository owns the guarded shared-generator adapter; the backend operator workspace contains private state and must never be copied into GitHub. Source publication does not select an open-source license or approve a public release; the new repository is private pending that decision.
