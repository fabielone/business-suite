---
tags: [business-suite, permissions, security]
updated: 2026-10-24
---
# Business Suite permissions

← [business-suite hub](<business-suite hub.md>) · [business-suite security privacy and operations](<business-suite security privacy and operations.md>) · [business-suite open decisions](<business-suite open decisions.md>)

BS-ACCESS-001 confirms individual access control. The detailed role templates below are implementation design; the user has not approved every manager, worker, driver, accountant or administrator grant. Keep module activation, personal navigation and actual authorization separate.

## Required decision at every backend action
Evaluate verified identity → active business membership → enabled capability → action privilege → record/entity/site scope → field visibility. A business ID in a header is a requested context, not proof of membership. Record assignment does not imply permission to inspect all job prices or worker finances. Backend list queries, commands, exports, attachments and asynchronous jobs use the same policy.

| Layer | Example | Proposed rule |
|---|---|---|
| Module | Work enabled, Money enabled | Business capability must be active or permit the requested closeout |
| Action | Read job versus close job versus review expense | Independent privilege checks; no broad screen-based authorization |
| Record | Assigned job, own expense, business reviewer scope | Explicit predicate; inaccessible IDs cannot bypass lists |
| Field | Agreed price, margins, rates, receipt contents, contact data | Omit restricted values from API; not merely CSS hiding |
| Administrative | Invite, grant, revoke, export, manage settings | Separate authority and audited changes; exact grants pending |

## E1 privileges and bounded fixture behavior
| Privilege | Initial purpose | Scope/limit |
|---|---|---|
| `work.jobs.read` | List jobs | Worker assignment scope; reviewer/manager scope per DB grants |
| `work.jobs.create` | Create a job | Server validates business and assignees |
| `work.jobs.close` | Complete permitted job | Matching record version and assignment/business scope |
| `work.prices.read` | Read agreed price | Without it, price field is omitted |
| `money.expenses.read` | List expenses | Own for worker; business review scope for reviewer |
| `money.expenses.submit` | Submit a business expense | Payer derived from authenticated identity in first slice |
| `money.expenses.review` | Approve/reject submitted expense | Reviewer scope; self-approval blocked provisionally |

`x-demo-user: manager|worker` chooses synthetic fixtures only in the explicit loopback demo process. It is not a production login or privileged header. Real identity derives from verified GoTrue-compatible JWT `sub`; roles in arbitrary headers or token role claims are not business grants. Actual seeded role-to-permission mapping and tests remain evidence pending in [business-suite quality and verification](<business-suite quality and verification.md>).

## Future policy matrix to resolve
| Actor/template | Normal work proposal | Sensitive authority kept separate |
|---|---|---|
| Worker | Assigned jobs, own timer/time, own expense submission | Price/margin access, direct posting and payment are distinct grants |
| Driver | Assigned trips, stops, mileage, own fuel/toll submissions | No automatic access to unrelated customer balances/payroll |
| Manager | Team planning, reviews, operational oversight | Review, self-approval, cash recording, reimbursement payment and export remain separate policies |
| Finance/bookkeeper | Approved financial records, allocations, reconciliation | Cannot silently change accepted job terms; payroll data minimized |
| Business administrator | Membership/module configuration within allowed policy | Admin role is not automatically payment approval; BS-DEC-013 decides grants |
| External accountant | Explicit delegated business access/export | No portfolio-wide access; statutory-system authority agreed separately |
| Anonymous/disabled member | No private business data | Sign-in/help only when implemented; revocation must invalidate effective business access |

These are proposals, not approved role templates. A small owner-operated business may combine privileges, but every resulting action retains actor/history. Self-approval and its exception path remain BS-DEC-010; E1's prohibition can reveal a single-owner limitation to resolve before pilot use.

## Financial authority must not collapse
Expense submit, direct post, expense review, approve reimbursement claim, record actual disbursement, record cash collection, confirm transfer, reverse/correct and export are separate capabilities in the full design. A missing receipt always requires review under BS-MONEY-004 even when normal direct posting is permitted. No initial endpoint moves money merely by approving an expense.

## Record and field rules
Initial own-expense reads must not expose another worker's expense simply because they share a job. A reviewer needs the declared business scope; a worker needs assignment on protected jobs. Every foreign link (job, worker, payment, receipt) must belong to the permitted business and relevant legal entity.

Agreed price, cost, margin, internal rates, reimbursement account information and customer details need individually documented field decisions. E1 demonstrates only the `work.prices.read` contract. Full field policy, negative overrides/deny precedence, temporary delegation and per-site grants remain proposed, not already implemented.

Exports must exclude fields the caller cannot read. Signed receipt URLs must be issued only after policy checks and expire; possession of a filename/UUID is not authorization. Support access requires explicit scope and audit, not an invisible superuser bypass.

## Changes and revocation
The grant editor, invitations and member disabling are future screens. Define who may change grants, invitation expiry, self-escalation protection, revocation latency and session invalidation. Re-evaluate effective grants server-side on consequential actions. Navigation can be cached for presentation, but must not become the authority.

Negative scenarios and evidence destinations are in [business-suite quality and verification](<business-suite quality and verification.md>); current task checkboxes remain only in NOTE-009 (Obsidian reference); NOTE-007/008 preserve historical foundation evidence.

## Offline permission boundary
NOTE-008 requires offline capture, but cached module/grant information is only a local eligibility snapshot. Server replay checks current membership/action/record/field scope before accepting or returning a command result. A stale grant cannot authorize an expense or closure. Cached data must be scoped to the identity/business that was permitted to fetch it, and only authorized fields should have been downloaded.

Known denial locks the initial demo queue and removes its confirmed snapshot; real offline session expiry, shared-device visibility, retained-payload access and purge policy are still unresolved. Do not replay old work under a new account to get around revocation. Full details are in [business-suite offline and multiplatform](<business-suite offline and multiplatform.md>) and BS-DEC-026.

## Desktop does not add business authority
The Electron main process and preload bridge are technical trust boundaries, not extra business roles. Validate IPC sender and bounded request shape, then apply the same server membership/action/record/field checks. An operating-system administrator or a local app profile does not automatically become a suite manager. Live/default desktop must fail closed rather than select a demo identity. Cached desktop snapshots and queued payloads need the same scope isolation and unresolved offline-session privacy policy as other clients.
