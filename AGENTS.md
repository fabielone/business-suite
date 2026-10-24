# Business Suite agent instructions

Working name only. This is a new single modular application replacing CRM and CocinaCostos eventually. A development backend is deployed; client login and replacement/cutover are unfinished.

## Start here
- Read README.md, docs/implementation-contract.md, and docs/interview-snapshot.json.
- External contributors can use docs/requirements without access to private notes or infrastructure. Propose documentation changes in pull requests; the maintainer reconciles accepted changes into the canonical notes before re-export.
- Canonical product requirements: `/Users/fabiel/Library/Mobile Documents/iCloud~md~obsidian/Documents/obnotes/business-suite/business-suite hub.md`.
- Maintainer agents with vault access: read the vault's `AGENTS.md`, `_management/Agent handbook.md` and the current task. External contributors follow CONTRIBUTING.md and the portable requirements instead. NOTE-007 is the historical initial foundation; NOTE-008 records offline-first/native continuation. NOTE-009 records Windows/macOS desktop implementation. NOTE-010 records the authorized Docker backend and GitHub publication; NOTE-011 records public release and licensing. Read `docs/offline-contract.md` before changing data access or client code, `apps/desktop/README.md` for shell/bridge boundaries, and `docs/shared-backend.md` plus `ops/lean-backend/README.md` before deployment work.
- Interview snapshot is historical evidence. Vault decisions and later human directions supersede it; unresolved answers remain unresolved.

## Working rules
- Offline-first browser, Android/iOS native and Windows/macOS desktop delivery are confirmed requirements, superseding the historical web-first/native-later snapshot. Platform-specific storage/UI may differ; share domain/sync rules.
- Commit local capture before claiming it is saved. Keep pending intent separate from confirmed records/approval/payment. Never silently discard unsynced work or automatically rebase money/state conflicts.
- Offline authorization is last-known only; current server checks decide acceptance. The present client engine is demo-only until real session/local-data security is implemented.
- Enforce business membership, enabled module, action privilege and record scope on the backend. UI hiding is not security.
- Treat money as integer minor units with explicit currency. Distinguish expense, approval, reimbursement and actual payment. Never automatically reprice an agreed job from its costs.
- Missing receipt always requires reason and review. Direct posting is not payment authority.
- No real customer data, credentials or receipt files in source, fixtures or notes.
- Demo identity and fixture data are explicit, isolated and loopback-only. Production must fail closed without verified authentication. Never silently fall back to demo.
- NOTE-010's direct human request authorizes adding the isolated Suite database/Auth/API to the existing Docker host and publishing source to a private GitHub repository. This supersedes the initial local-only restriction for that task. Preserve peer apps, their credentials/data, the permanent tunnel and website; no legacy cutover is implied. NOTE-011 separately authorizes making the source repository public.
- Shared-host changes are scoped: use the reviewed adapter/deployment procedure, a completed private backup and explicit Suite services. Never use bare `backend.py up`, recreate the shared database, rotate peer keys or remove volumes as a Suite rollout step. The Suite API uses `business_suite_runtime`, not an owner/service-role connection; no Suite PostgREST route exists.
- Live backend availability does not enable real client sign-in. Keep production clients setup-only until authentication, local-data privacy and authorized sync are implemented and tested. Keep operator secrets/backups/private test accounts outside source and notes.
- Keep modules internally separated in one application; avoid microservices, generic workflow engines or universal entity tables without evidence.
- Add meaningful tests for financial/auth/state invariants and check changed UI on narrow and wide viewports. Record checks actually run and limitations.
- During an active coordinated session, respect the current task's delegated paths and lockfile owner. NOTE-007 initial allocations expire when that task is Done; future agents claim their own authorized scope. Do not treat historical agent assignments as permanent locks.
- NOTE-011 explicitly authorizes public GitHub visibility and open-source licensing. Original project materials use AGPL-3.0-only; read LICENSE, LICENSING.md and CONTRIBUTING.md. Preserve copyright and third-party notices. Fabiel is the sole current maintainer; contributions do not transfer copyright or grant write access.
