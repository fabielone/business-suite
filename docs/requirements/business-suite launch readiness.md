---
tags: [business-suite, launch, status]
updated: 2026-11-17
---
# Business Suite launch readiness

← [business-suite hub](<business-suite hub.md>) · [business-suite roadmap](<business-suite roadmap.md>) · [business-suite change process](<business-suite change process.md>) · [business-suite change requests](<business-suite change requests.md>)

The single list of what stands between the current code and a production launch. It comes from the repository review of 2026-11-17 (NOTE-018 (Obsidian reference)). Status here is authoritative for launch work; the roadmap keeps the long-term product sequence.

## Scope decided 2026-11-17 (H-LAUNCH-20261117)
- Moving data out of the old CRM and CocinaCostos is **not required** for launch. See [business-suite migration](<business-suite migration.md>).
- A general way to **import data** is wanted. It does not have to read those two applications.
- Interface and workflow changes are expected before launch; they are collected in [business-suite change requests](<business-suite change requests.md>).

## Proposed launch phases
These phases are a proposal, not yet confirmed by Fabiel.

| Phase | Who uses it | Needs |
|---|---|---|
| A. Browser pilot | Fabiel's own team on the web app | LR-01 to LR-09 |
| B. Open browser launch | Other businesses sign up | Phase A plus LR-10 to LR-14 |
| C. Phone and desktop apps | Installed apps with real sign-in | Phase B plus LR-15 |

## Workstreams
Status values: Open, In progress, Blocked, Done. "Owner" says who can move it next.

| ID | Workstream | Status | Owner | Current state and next action |
|---|---|---|---|---|
| LR-01 | Hosted CI gates every merge | **Blocked** | Fabiel | Every GitHub Actions run fails before starting. Run 44090490899 (2026-11-17) reports: "The job was not started because your account is locked due to a billing issue." The workflow file itself is valid. **Next: resolve billing in GitHub account settings**, then re-run `local-foundation-checks` |
| LR-02 | Dependency advisories | In progress | Agent | `npm audit fix` on branch `note-018-launch-readiness` cleared all high advisories (node-forge, Zod, glob). 8 moderate remain, all `minimatch` inside electron-builder and Expo build tooling, fixable only by a breaking upgrade. Type checks, 92 unit tests, web/API build and mobile export pass after the update. Next: merge; revisit the moderate ones with the next Electron/Expo upgrade |
| LR-03 | Production hosting, domain and TLS | Open | Fabiel decides (BS-DEC-023) | Today: one Mac, shared Docker host, tunnel `api-dev.fabiel.org`. Needs a decision on VPS or managed host, a production domain and a separate production database |
| LR-04 | Monitoring and error reporting | Open | Agent after LR-03 | No error tracking, metrics, uptime check or alerting. Health endpoint only proves the process is alive |
| LR-05 | Backups and recovery | Open | Agent after LR-03 | Backups are manual and stay on the host. Needs scheduled encrypted off-site copies and a restore rehearsal on a fresh host with real-shaped data |
| LR-06 | Email and account recovery | Open | Fabiel picks provider | No SMTP: no password reset, no email verification, invitations are hand-shared links. Needs a mail provider, sender domain and the reset/verify screens |
| LR-07 | Security review of the operations API (`/v2`) | Open | Agent | Check rate limits beyond sign-in, cross-site request protection for cookie sessions, tenant isolation tests for every collection, upload and restore size limits. One bounded review exists; no full audit |
| LR-08 | Interface and workflow changes | Open, waiting for the list | Fabiel lists, agent builds | CR-001 in [business-suite change requests](<business-suite change requests.md>). Each item follows [business-suite change process](<business-suite change process.md>) |
| LR-09 | Data import | In progress | Agent, then Fabiel reviews | Built on branch `note-019-data-import` (NOTE-019 (Obsidian reference)): people, companies, pipeline projects and orders import from CSV with preview and templates. Imports never run automations, never record payments and never release an order. Open: opening balances (BS-DEC-012) and already-finished orders. Next: Fabiel tries it with a real export; merge |
| LR-10 | Receipts and private files | Open | Agent after LR-03 | Receipt and attachment types exist; private storage, size/type limits, retention and download authorization need building against the chosen host |
| LR-11 | Legal and privacy | Open | Fabiel | Terms, privacy notice, data export and deletion requests, retention (BS-DEC-015). Agent can draft; Fabiel approves |
| LR-12 | Spanish and accessibility | Open | Agent | English default with Spanish toggle is decided (BS-DEC-024) but incomplete. No full keyboard, contrast and screen-reader pass yet |
| LR-13 | Subscriptions and billing | Open | Fabiel decides | Entitlements are configuration only and charge nobody. Decide whether launch needs paid plans |
| LR-14 | Release procedure | Open | Agent after LR-03 | Deployment is a manual three-phase script. Needs a staging environment, a tagged release, and a tested rollback |
| LR-15 | Phone and desktop apps | Open, later phase | Agent | Both are demo or setup-only and still on the older `/v1` flows. Needs real sign-in, encrypted local storage, the operations screens, physical-device and Windows tests, signing and notarization, store listings |
| LR-16 | Product name | Open | Fabiel (BS-DEC-001) | Repository says "Zut CRM", notes say "Business Suite". Pick one before public copy and domains |

## What already holds
- Sign-in tokens are verified and the API refuses to start with an over-privileged database login.
- Row-level tenant isolation, idempotent commands and an audit trail are in place and tested against real PostgreSQL.
- The browser app has invitations, roles, encrypted offline capture, CSV export and workspace backup/restore.
- Type checks and 92 unit tests pass locally (2026-11-17, Node 25.5 host; Node 22 is the supported version).

## Not checked in the 2026-11-17 review
Browser, real-PostgreSQL, Electron and device suites were not re-run that day; their last recorded results are in repository `docs/verification.md`.
