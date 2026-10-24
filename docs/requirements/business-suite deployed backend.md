---
tags: [business-suite, backend, deployment, operations]
updated: 2026-10-24
---
# Business Suite deployed backend

← [business-suite hub](<business-suite hub.md>) · [business-suite architecture](<business-suite architecture.md>) · backend infrastructure (Obsidian reference)

## Current scope and authority
The human explicitly requested setup on the existing shared Docker server and commit/upload to GitHub on 2026-10-24. NOTE-010 Deploy Business Suite backend and publish repository (Obsidian reference) owns this work. This supersedes earlier local-only restrictions for this deployment. Existing CRM/CocinaCostos and other apps are retained; there is no legacy migration or client cutover.

**Development backend running:** Business Suite has its own database, GoTrue Auth and Fastify API on the Mac's existing `lean-backend` stack. It shares PostgreSQL infrastructure with other products, not their databases, users or credentials. The same independent Suite database holds Suite's internal business tenants with scoped access. This is one modular product backend, not one database per internal module.

| Boundary | Deployed value |
|---|---|
| Suite source | `/Users/fabiel/Desktop/business-suite` |
| Operator workspace | `/Users/fabiel/Desktop/backend` (not a Git repository) |
| Development base | `https://api-dev.fabiel.org/apps/business_suite` |
| API health | `/api/healthz` returns HTTP200, `status: ok`, `demo: false` |
| Auth | `/auth/v1`, separate Suite issuer/signing secret; audience `authenticated` |
| Business routes | `/api/v1/workspace`, `/api/v1/jobs`, `/api/v1/expenses` and implemented commands |
| Generic table REST | Absent; no Suite PostgREST container or route |
| Database | `business_suite` on shared PostgreSQL17.11 |
| Schema owner | `business_suite_owner`; migration authority, not runtime login |
| Runtime login | `business_suite_runtime`; restricted grants, no role memberships, no ownership or RLS bypass |
| API container | `business_suite-business`, Node22, UID1000, read-only root, bounded resources, no published host port |
| Gateway | Existing Caddy through loopback127.0.0.1:8000 and permanent development tunnel |
| Initial web origins | Exactly `http://127.0.0.1:5178` and `http://localhost:5178` |
| Account onboarding | Public signup disabled; OAuth/SMTP not activated for Suite; no permanent real users or businesses provisioned |

No secret belongs in this note, source or a frontend bundle. Operator credentials remain under the backend's private `.local/` configuration. The repository contains integration logic and placeholders, never a copy of that configuration or database dumps.

## What works and what remains
The deployed API implements the bounded Work/Money slice already in source: job listing, creation and authorized completion; missing-receipt expense submission/review; business/member/module/action/record checks; worker price hiding; integer money; version checks, idempotency and append-only audit. Expense approval does not create a payment or reimbursement.

Real client sign-in, refresh/session handling, onboarding/membership administration, offline account/privacy policy and connections from the browser/mobile/desktop clients remain unfinished. Those clients still use explicit fictional demo or setup mode. A deployed API is not evidence that the installed apps use it. Real receipts, reimbursement/payment workflows, full CRM/resources/time/trips and legacy imports remain later work. Do not silently switch demo clients or seed actual users with administrator grants.

## Repeatable source and operations
The repository owns `Dockerfile`, `.dockerignore`, `ops/deploy_shared.py`, the guarded `ops/lean-backend/` adapter and test sources. `docs/shared-backend.md` is the operator runbook. The shared backend source was backed up privately before the adapter installation; its reviewed source hash and installation manifest guard against overwriting unrelated generator changes.

Sequence: take/review private backup and peer baseline; build the server image; validate/install the adapter; stage and validate only Suite configuration; provision Suite database/Auth and migrations; start only Suite API; validate Caddy using a fresh bind mount; restart only the gateway to load its route. Configuration rendering preserves existing peer service tokens and fails if peer definitions/routes change. Avoid bare `backend.py up`: it recreates peer Auth services.

The API does not run migrations or seed data at startup. Use separate administrator migration authority and grant only required runtime operations afterward. Existing legacy generated service roles are unused by this API and have no Suite business-table privileges.

Backups, temporary migration environment files and baseline snapshots stay on the operator host. The predeployment complete backup is `backups/20261024T174959Z`; the pre-migration Suite snapshot is `.local/business-suite-before-migrations.dump`. Do not restore over an occupied database or replace current peer configuration from an old snapshot. Stop/recover only the Suite service on failure; preserve its data. Off-site encrypted backup scheduling, monitoring, SMTP and VPS production operations remain open.

## Verification record
The canonical final results belong in NOTE-010 2026-10-24 Backend deployment and GitHub report (Obsidian reference). At the first deployment checkpoint, public/local health passed; nine actual PostgreSQL test groups passed (parallel idempotent retries, conflicting payloads/versions, JWT/permission checks, business isolation, runtime grants, pooled context reset and migration checksum validation). All38 existing unit/API tests and all-workspace type checks passed.

The temporary PostgreSQL concurrency database/login/environment file were removed. All21 prior container IDs were preserved; only the shared gateway was restarted and prior healthy containers remained healthy. Suite runtime CONNECT is denied for all seven peer app databases. Actual GoTrue password-login/API/restart/cleanup evidence, restore drill and GitHub/CI final outcomes are recorded in the final report rather than inferred from health.

## Next agent
Read the current task/report and `docs/shared-backend.md` before running commands. Next client integration must use the Suite Auth issuer, `Authorization: Bearer` and explicit `X-Business-Id`; never accept a client-supplied role as authority. Provision Suite identity/membership/grants separately from Auth identity, preserve last-known offline authorization semantics, and prove account switching/revocation/logout with unsynced work before handling real data. An exact hosted frontend origin and native callback policy must be chosen before expanding allow-lists.

## Final backend verification checkpoint
Eight deployed Auth/API groups passed, including real password-issued JWTs and persistence through an API-only restart. Both fictional users and their test tenant were removed; Auth and business records are empty. Complete postdeployment backup: `backups/20261024T180224Z`. Its Suite archive restored into an isolated same-cluster temporary database and matched table/RLS/migration/count/audit-trigger checks; recovery DB removed. This was a no-owner/no-privileges empty-data restore, not fresh-host or off-site recovery. Seven operator-plan and five adapter tests pass. Source commit25d2acd is pushed to private [fabielone/business-suite](https://github.com/fabielone/business-suite); ca329c4 adds a manual CI trigger. Human workflow authorization was completed. Hosted CI reports startup_failure before jobs; workflows pass actionlint and local/live checks pass, but no hosted test pass is claimed. NOTE-010 2026-10-24 Backend deployment and GitHub report (Obsidian reference) owns current publication/CI status.

## Source-release supersession — NOTE-011, 2026-10-24
The human subsequently authorized making [fabielone/business-suite](https://github.com/fabielone/business-suite) public with AGPL-3.0-only for original project work. License installation is complete; GitHub public visibility and AGPLv3 recognition are verified under NOTE-011 License and publicly release Business Suite (Obsidian reference); [business-suite open source and contributions](<business-suite open source and contributions.md>) records the policy. The private-upload wording in the NOTE-010 checkpoint above is historical. Public source does not expose the backend's private `.local/` state, credentials or backups, enable public signup, or complete client authentication. This source-release task makes no backend/runtime changes.
