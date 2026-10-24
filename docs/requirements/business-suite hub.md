---
tags: [hub, business-suite, requirements]
updated: 2026-10-24
---
# Business Suite

**Working name. One custom open-source, offline-first business application with native multiplatform clients and browser access, and modules adapted to each business and user's privileges.** It is intended eventually to replace CRM and CocinaCostos while adding operational capabilities. The existing applications remain intact until an explicit migration and cutover.

The current operation does not need a sales pipeline. CRM is optional. Jobs, receipts, expenses, income, amounts due, assignments and trips all remain important product requirements; the small initial implementation is sequencing, not cancellation of the rest. The first test group is approximately five people, not a product limit. The exact first operating workflow remains to be clarified. Earlier human direction also requires quotations, site visits, worker/resource allocation, man-hours and future professional payroll/tax/bookkeeping integrations, aimed at small operators in Mexico with international and larger-business growth later.

**Current delivery — NOTE-009, 2026-10-24:** offline-first Android/iOS, Windows/macOS desktop applications and browser access are in scope. The human explicitly included both desktop platforms now. Electron is the desktop engineering choice; React Native/SQLite remains mobile. NOTE-008 verified a bounded two-command offline foundation, not the full product. Desktop runtime/package evidence and live auth/storage privacy remain separate. [business-suite desktop applications](<business-suite desktop applications.md>) and [business-suite offline and multiplatform](<business-suite offline and multiplatform.md>) define the contracts.

## Read in this order
1. [Confirmed requirements and their provenance](<business-suite requirements.md>).
2. [Questions that must remain unanswered until resolved](<business-suite open decisions.md>).
3. [Domain boundaries and state transitions](<business-suite modules and workflows.md>).
4. [Who can do and see what](<business-suite permissions.md>).
5. [Financial rules and reimbursement behavior](<business-suite money and reimbursements.md>).
6. [Delivery sequence and actual evidence status](<business-suite roadmap.md>).

## Specification map
| Area | Canonical note |
|---|---|
| Purpose and requirement IDs | [business-suite requirements](<business-suite requirements.md>) |
| Unresolved product policies | [business-suite open decisions](<business-suite open decisions.md>) |
| Work, CRM, resources, trips and time | [business-suite modules and workflows](<business-suite modules and workflows.md>) |
| Module/action/record/field access | [business-suite permissions](<business-suite permissions.md>) |
| Business expense, worker balances, customer payments | [business-suite money and reimbursements](<business-suite money and reimbursements.md>) |
| Proposed entities and constraints | [business-suite data model](<business-suite data model.md>) |
| Screens, role flows and errors | [business-suite screens and flows](<business-suite screens and flows.md>) |
| Offline persistence, synchronization and native platforms | [business-suite offline and multiplatform](<business-suite offline and multiplatform.md>) |
| Windows/macOS packaging, local profile, updates and release evidence | [business-suite desktop applications](<business-suite desktop applications.md>) |
| Initial HTTP contract and future integrations | [business-suite API and integrations](<business-suite API and integrations.md>) |
| Architecture decisions and engineering defaults | [business-suite architecture](<business-suite architecture.md>) |
| Security, personal data and operations | [business-suite security privacy and operations](<business-suite security privacy and operations.md>) |
| Meaningful tests and evidence levels | [business-suite quality and verification](<business-suite quality and verification.md>) |
| Legacy import and authority cutover | [business-suite migration](<business-suite migration.md>) |
| Current slice and future work | [business-suite roadmap](<business-suite roadmap.md>) |
| Source inventory and agent instructions | [business-suite sources and agent handoff](<business-suite sources and agent handoff.md>) |

## Active task and repository
Latest completed local extension: NOTE-009 (Obsidian reference). Its acceptance criteria and execution checklist are authoritative; these notes do not duplicate task checkboxes. NOTE-008 retains the completed offline/mobile foundation record. NOTE-007 (Obsidian reference) retains the completed local-foundation record.

Repository: [Desktop business-suite](/Users/fabiel/Desktop/business-suite). Start with its [AGENTS.md](/Users/fabiel/Desktop/business-suite/AGENTS.md), [implementation contract](/Users/fabiel/Desktop/business-suite/docs/implementation-contract.md), and [interview snapshot](/Users/fabiel/Desktop/business-suite/docs/interview-snapshot.json).

**Verified local foundation — 2026-10-23:** 15 linked specification notes, a Desktop Git repository, connected responsive Work/Money demo and backend permissions/persistence foundation. Type checks and builds pass; 11 backend scenarios and 8 browser flows pass. Desktop and phone screenshots were inspected. NOTE-007 2026-10-23 Business Suite foundation report (Obsidian reference) records limits and handoff. Real login UX/provider provisioning, receipt storage, remaining modules, PostgreSQL server/concurrency checks and migration/cutover remain unfinished.

## Specification authority
Direct later human decisions supersede older notes. [business-suite requirements](<business-suite requirements.md>) distinguishes confirmed requirements from proposed design and bounded engineering defaults. The interview snapshot is historical evidence; its statement that implementation has not started must not overwrite later dated implementation reports. Research documents explain recommendations but are not blanket product approvals.

No deployment, purchases, remote publication, legacy deletion or data migration follows from a proposed architecture or backlog entry. The current authorized local work is recorded in NOTE-009; NOTE-007/008 preserve historical foundation evidence.

**NOTE-008 local result:** 30 shared/API/native unit scenarios and10 browser flows pass; Android/iOS exports pass. Actual native-device/runtime tests, real authentication and5 high Expo toolchain audit entries remain before release. NOTE-008 2026-10-23 Offline and native foundation report (Obsidian reference).

## Verified desktop foundation — 2026-10-24
NOTE-009 now has a packaged Electron desktop foundation: 38 aggregate unit/API tests, 3 actual macOS Electron runtime tests, all-workspace type checks and 10 browser regressions pass. On macOS 27.0.1 arm64, two queued intents survive app quit/relaunch and sync with their original IDs; the packaged demo shell also launches without a web/API server. Unsigned Mac DMG/ZIP and Windows x64 ZIP are built and integrity-checked.

Windows NSIS installer creation failed on the ARM build host; no Windows runtime or CI run is claimed. Signing/notarization, real auth/local privacy, upgrades/uninstall/recovery and full business workflows remain unfinished. Exact evidence, failure cause and artifact links: [business-suite roadmap](<business-suite roadmap.md#note-009-desktop-foundation--2026-10-24>).

Final desktop report: NOTE-009 2026-10-24 Desktop application foundation report (Obsidian reference). NOTE-009 edit claims are released; further work needs its own authorized scope.
