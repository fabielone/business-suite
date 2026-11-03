---
tags: [business-suite, decisions, discovery]
updated: 2026-11-03
---
# Business Suite open decisions

← [business-suite hub](<business-suite hub.md>) · [business-suite requirements](<business-suite requirements.md>) · [business-suite architecture](<business-suite architecture.md>)

**This is the decision queue, not an instruction to stop independent authorized work.** Do not invent answers or ask again for choices already confirmed. Each item needs a dated human answer or a clearly bounded engineering default. Current implementation defaults do not close these questions.

| ID | Decision and status | What depends on it | Safe current position |
|---|---|---|---|
| BS-DEC-001 | Final brand and product name | Public identity, domains, copy | Business Suite is provisional |
| BS-DEC-002 | Resolved policy 2026-10-24: AGPL-3.0-only for original project work; public source; sole official maintainer welcomes contributions | License installation/publication evidence under NOTE-011; compatible dependencies and future binaries still need review | Preserve attribution; compliant independent commercial forks allowed; contributors retain their rights; see [business-suite open source and contributions](<business-suite open source and contributions.md>) |
| BS-DEC-003 | Exact first pilot and operating day | Default screens, fixture terms, acceptance walkthrough | Preserve food selection and later physical-work clarification; do not choose one silently |
| BS-DEC-004 | Quote acceptance: manager-recorded shared/PDF acceptance, customer web acceptance, or both | Evidence, portal, approval signatures | No fabricated acceptance; quote implementation deferred |
| BS-DEC-005 | Resolved 2026-11-03 (H-CRM-20261103): Project = the sales deal (no container above it); a Project leads to Orders; Orders hold Jobs; Jobs hold Tasks | Navigation, grouping, job closure semantics | See [business-suite CRM workflow and terminology](<business-suite CRM workflow and terminology.md>); NOTE-013 `deals` = Project, NOTE-013 `projects` = Order |
| BS-DEC-006 | Recurrence: automatic generation versus manual creation/copy | Contracts, scheduler, pause/cancel rules | Do not generate future jobs automatically |
| BS-DEC-007 | Scheduling conflicts: warn/override, block, or no warning | Resource reservation and dispatch | Record assignments; do not claim conflict prevention |
| BS-DEC-008 | Materials: purchase/use costing, stock balances, reservations | Inventory schema, commitments and shortage UI | Record cost only where supported; never claim stock availability |
| BS-DEC-009 | Treatment of submitted/rejected expenses in job cost reports | Management margin and committed/actual figures | Show status categories separately; no single unlabeled total |
| BS-DEC-010 | Self-approval and separation of expense review/reimbursement/payment authority | Roles and single-owner operations | E1 blocks self-approval; this is a conservative default, not human policy |
| BS-DEC-011 | Mixed funding, company advances and unused cash returns | Claim amounts and cash custody | Do not infer a full reimbursement from an uncertain funding split |
| BS-DEC-012 | What creates customer, supplier, worker and advance balances | Billing/claims and opening balances | Preserve separate event types; no sales-minus-all-payments shortcut |
| BS-DEC-013 | Exact individual role/grant templates and who grants them | Invitations, field visibility, revocation | E1 synthetic manager/worker test grants only |
| BS-DEC-014 | Who records cash, confirms transfers and records reimbursements | Posting and reconciliation controls | Expense submission/review grants do not confer payment authority |
| BS-DEC-015 | Privacy, employee/driver visibility, location/time consent and retention | Uploads, tracking, exports, deletion | Minimum necessary data; no continuous GPS or legal retention invented |
| BS-DEC-016 | Partly resolved 2026-11-03: Project (deal) and Order are separate records; an Order is created by an explicit action from the accepted quote; an Order may exist without a Deal. Agreed-price amendments remain open | Commercial model and billed amounts | No automatic won-to-order creation; no compulsory invoice per job; see [business-suite CRM workflow and terminology](<business-suite CRM workflow and terminology.md>) |
| BS-DEC-017 | Time approval, timer overlap and corrections | Labor costing and payroll export | Timer/manual capture required; policies pending |
| BS-DEC-018 | Labor rate basis, overhead allocation and costing recognition | Estimates, actual cost, margin labels | Label basis; no automatic repricing or statutory-profit claim |
| BS-DEC-019 | Businesses, legal entities and resources shared across them | Access, intercompany records, consolidation | Explicit scope; no cross-business sharing by default |
| BS-DEC-020 | Offline policy details after confirmed offline-first requirement | Offline access duration, prefetch bounds, conflict resolution, local-data recovery | Need for offline is resolved by H-OFF-20261023; two-command demo slice does not settle full policy |
| BS-DEC-021 | Initial import sources, opening balances and cutover scope | Replacement of CRM/CocinaCostos | Old apps remain authoritative for their existing records |
| BS-DEC-022 | Accountant, payroll/fiscal/payment providers and authoritative books | Connectors and legal mappings | No provider selected or live connector claimed |
| BS-DEC-023 | Hosting, operational ownership, backups and launch targets | Production rollout | Local task only; Docker unavailable at initial task inspection |
| BS-DEC-024 | Partly resolved 2026-11-03: English UI by default with a Spanish toggle. Locale formats and currencies beyond MXN remain open | Copy, timestamps, number input | E1 MXN; English/Spanish UI strings |
| BS-DEC-025 | Resolved 2026-10-24: Windows and macOS desktop apps now | Current desktop delivery under NOTE-009 | Human selected both; Linux not added; release details move to BS-DEC-029/030/031 |
| BS-DEC-026 | Offline access after token expiry, logout, revocation or device loss | Cache lock, queue retention, shared-device behavior and authentication recovery | Fictional demo only until live auth/storage privacy is designed and tested |
| BS-DEC-027 | Local storage retention, capacity, recovery and encryption policy | Cached records, receipt blobs, backups and unsynced loss risk | No promise that browser eviction/reinstall/device loss preserves unsynced work |
| BS-DEC-028 | Full offline workflow and conflict resolution policy | Receipt/time/trip/assignment/money workflows beyond initial allowlist | Preserve requirements; no automatic financial merge or silent server-version rebase |
| BS-DEC-029 | Desktop minimum OS versions and processor architectures | Windows/macOS compatibility and test matrix | Packaging targets are bounded evidence, not support promises |
| BS-DEC-030 | Desktop distribution, signing/notarization and update policy | Installer format, credentials, release channel and rollback | Local packages only unless separately authorized; no automatic updater or signing claim |
| BS-DEC-031 | Desktop profile, installation/removal and local-data recovery policy | Branding changes, updates, uninstall, retention and shared devices | No app-controlled silent deletion of unsynced work; exact paths/behavior require verification |
| BS-DEC-032 | Resolved 2026-11-03: a manager can complete other people's tasks, as can the assignee and their team lead | Task permissions, audit | Record who completed each task |
| BS-DEC-033 | Resolved 2026-11-03: a manager can release an Order into production without a deposit and must give a reason | Release grant, activity history | Record actor, basis and reason; release never implies payment |
| BS-DEC-034 | Resolved 2026-11-03: an Order split between team members shows one "Order / Job" card per piece; a shared marker shows the pieces belong to the same Order; each team member sees only their pieces; an unsplit Order is one card | Worker screens, Job records | Jobs are real records assigned to members |

## Confirmed delivery correction
On 2026-10-23 the human required offline-first operation and native multiplatform apps. BS-PROD-003/010 now state the current requirement. BS-DEC-020 retains its ID for unresolved policy detail; whether offline is needed is no longer unanswered. Historical reports and the interview snapshot remain unchanged as dated evidence.

On 2026-10-24 the human answered BS-DEC-025: include Windows and macOS now. The current platform question is resolved; only the release/support details above remain open. See [business-suite desktop applications](<business-suite desktop applications.md>).

## Licensing resolution — NOTE-011, 2026-10-24
The human explicitly requests public source, credit, official-project control, forks and pull requests, and identifies themselves as the sole owner and current maintainer. Within that authorization, AGPL-3.0-only is the selected strong-copyleft policy for original project work. The exact license choice is no longer unanswered; repository installation and public visibility remain verification steps in NOTE-011 License and publicly release Business Suite (Obsidian reference). Official merge/release authority does not confer control over compliant independent forks. Contributor ownership, third-party terms and future distribution checks are defined in [business-suite open source and contributions](<business-suite open source and contributions.md>).

## Preserve these interpretations
The interview's current-work clarification does not cancel the earlier food-pilot selection, and that selection does not require a restaurant-specific first release. Confirm the actual job/trip/expense workflow before choosing industry defaults. Approximately five test participants is not a capacity ceiling or proof of organization structure.

Both expense review and privileged direct posting were selected. The missing-receipt exception still requires manager review. Direct posting does not imply self-approval or payment authority. The current missing-receipt-only implementation cannot demonstrate the complete receipt-present/direct-posting policy.

## Recording a resolution
Use: decision ID; date; human wording or source; selected policy; affected requirement IDs; data/API/UI/test consequences; migration effect; implementation evidence link. Keep rejected options only where they explain a consequential tradeoff. A later technical implementation report records what was built, not a new human answer.

## Current execution
Current licensing/public-source acceptance and task status live in NOTE-011 (Obsidian reference); NOTE-010 preserves deployed-backend evidence and NOTE-009 preserves desktop evidence; NOTE-008 preserves the completed offline/mobile foundation; NOTE-007 (Obsidian reference) preserves the completed foundation evidence. The first local job/expense slice can progress without resolving every item above. A dependent feature must either wait for its answer or clearly expose the bounded default and limitation.

## CRM workflow and terminology resolution — 2026-11-03
The human defined the shared CRM/ERP vocabulary and the Insignia workflow in a planning conversation (H-CRM-20261103) and stated that the decisions in that conversation control. A second round of answers the same day replaced the first round where they differ. Result: BS-DEC-005, 032 and 033 resolved; BS-DEC-016, 024 and 034 partly resolved. Confirmed points: a Project is the sales deal (no container above it) and a Person or Company can have many; Project and Order are separate; Order / Job cards form the production timeline; production sees work only once an Order exists and never sees prices; the assignee, team lead or a manager can complete a task; the deposit normally releases an Order into production and a manager can release without one by giving a reason; one Project can lead to several Orders; each team member sees only work assigned to them, and the manager assigns members and sets assignment automations; English UI with a Spanish toggle; "qualified" on a Person means decision maker; automations use When/then and When/wait/then. Full record: [business-suite CRM workflow and terminology](<business-suite CRM workflow and terminology.md>).
