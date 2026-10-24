# Business Suite agent instructions

Working name only. This is a new single modular application replacing CRM and CocinaCostos eventually, not a deployed replacement.

## Start here
- Read README.md, docs/implementation-contract.md, and docs/interview-snapshot.json.
- Canonical product requirements: `/Users/fabiel/Library/Mobile Documents/iCloud~md~obsidian/Documents/obnotes/business-suite/business-suite hub.md`.
- Read the vault's `AGENTS.md`, `_management/Agent handbook.md` and the current task. NOTE-007 is the historical initial foundation; NOTE-008 records offline-first/native continuation. NOTE-009 records Windows/macOS desktop implementation. Read `docs/offline-contract.md` before changing data access or client code and `apps/desktop/README.md` for shell/bridge boundaries.
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
- Existing apps, shared backend, tunnels and data remain unchanged. No remote or deployment is implied by this local task.
- Keep modules internally separated in one application; avoid microservices, generic workflow engines or universal entity tables without evidence.
- Add meaningful tests for financial/auth/state invariants and check changed UI on narrow and wide viewports. Record checks actually run and limitations.
- During an active coordinated session, respect the current task's delegated paths and lockfile owner. NOTE-007 initial allocations expire when that task is Done; future agents claim their own authorized scope. Do not treat historical agent assignments as permanent locks.
- Open-source intent is confirmed; license choice is pending. Do not claim an OSI license until selected and added.
