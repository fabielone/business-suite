---
tags: [business-suite, architecture, data]
updated: 2026-10-24
---
# Business Suite data model

← [business-suite hub](<business-suite hub.md>) · [business-suite modules and workflows](<business-suite modules and workflows.md>) · [business-suite architecture](<business-suite architecture.md>)

This is a target conceptual dictionary plus the bounded `E1` interface, not a claim that all tables exist. Implementation evidence belongs in [business-suite roadmap](<business-suite roadmap.md>) and the task report. Inspect actual migrations before naming a field or constraint as implemented.

## Context and identity
A tenant or business account is an isolation boundary. A legal entity owns legally meaningful obligations/books. A site is an operating location. A role workspace is a navigation view, not an access boundary. Defaulting a tiny operator to one business/entity/site can keep onboarding simple without equating the concepts.

| Proposed object | Meaning and important attributes | Ownership |
|---|---|---|
| Business account | ID, display name, currency defaults, lifecycle, enabled capabilities | Platform |
| Legal entity and site | Account owner, legal identity/settings; site entity association | Platform/settings |
| User and membership | Auth subject, active membership, grants, record scope | Identity/access |
| Party and contact | Customer/supplier/person identity and scoped contact methods | Shared parties; role-specific extensions |
| File/evidence reference | Business owner, storage key, type, creator, access metadata | Evidence service plus parent record |
| Command receipt and audit event | Idempotency identity, request hash, result reference; actor and changes | Platform |

The first API exposes `business`, `user`, `modules`, `permissions` and `demo`. That response is not a complete membership or legal-entity schema. Reconcile historical CRM `workspace_id` and CocinaCostos `business_id` through reviewed migration maps; never equate identical-looking IDs across systems.

## Commercial commitment and execution
| Proposed object | Required meaning | Important relation |
|---|---|---|
| Opportunity | Optional sales prospect/pipeline context | May end without purchase |
| Site visit | Appointment, observed requirements, notes, measurements/evidence under permission | May precede quote or relate to existing work |
| Quote and revision | Proposed scope, quantities, price, terms, validity and acceptance evidence | Revision must identify what was accepted |
| Order/commitment and revision | Accepted commercial scope and agreed terms | Owns immutable accepted snapshots and amendments |
| Order line | Typed item/service, agreed quantity/unit/price | Belongs to one revision/commitment context |
| Work unit/job | Executable work with state, due/schedule, responsible people | May fulfill order lines or be authorized internal work |
| Work allocation | Quantity/scope assigned to a work stage or batch | Connects work and order line, not a sale itself |
| Fulfillment | Actual delivery/service completion quantity and reversal evidence | Controls delivered quantity |
| Assignment/time/trip | Worker/resource scheduling and actual time/travel | Relates to work without becoming its commercial price |

One accepted signage order may create survey, fabrication and installation jobs. Several food orders can share a production batch; one payer may order six portions. Sequential stages may each plan the same quantity, so never globally sum every stage allocation and compare it with ordered quantity. Fulfillment alone determines delivered quantity. Scrap and rework do not automatically add customer charges or count as new delivery.

A narrow work-unit header can have typed extensions for installation detail, professional service engagement, or food batch/recipe revision. It must not become an unvalidated JSON object containing every financial and operational concept. Job/task/project hierarchy, recurring work and inventory reservation policies are open decisions.

`E1` job projection is exactly `id`, `title`, `customerName`, `status`, optional authorized `agreedPriceMinor`, `currency`, `assignedUserIds`, `version`. `customerName` and direct price capture are prototype shortcuts. They do not establish a complete customer registry, accepted order, quote revision or revenue record. Later work must map them deliberately to typed commercial records without creating two authoritative prices.

## Money and supply
| Proposed object | Meaning and fields to settle |
|---|---|
| Expense/purchase evidence | Business portion, personal portion, payer, evidence/missing reason, review status |
| Expense/cost allocation | Allocation to work, trip or overhead with unit/currency and allocation basis |
| Purchase and supplier bill | Goods/services ordered and supplier amount owed; receipt and consumption are separate events |
| Receivable/payable obligation | Party/entity/currency, source, original amount, credits, due date, outstanding derived from allocations |
| Payment | Direction, amount, currency, actual occurrence, method, actor/provider reference, status |
| Payment allocation | Explicit settlement amount connecting payment and obligation |
| Reimbursement group | Selected personally funded eligible expenses; approval/grouping does not itself pay |
| Operational cost entry | Actual consumption, labor cost or overhead under an explicit reporting basis |
| Accounting export/mapping | Source revision, external posting identity/status, reconciliation result |

`E1` expense projection is `id`, `jobId`, `description`, `amountMinor`, `currency`, `payerUserId`, `status`, `missingReceiptReason`, `version`. No payment, bank integration, receipt-file store or mixed-funding implementation follows from that shape. Purchase, consumption, reimbursement and accounting posting must not count one economic event multiple times.

## Proposed integrity constraints
- Every owned record carries its business scope. Foreign keys include that scope where practical so a valid UUID from another business cannot create a cross-business relationship. Legal entity/currency relations add their own constraints.
- Opaque UUIDs are identifiers, never proof of authorization. Queries, commands, exports, jobs and file URLs all apply access policy.
- Positive amounts and valid currency are checked at boundaries and in storage. First-slice money uses safe integer MXN centavos; quantities and durations use explicit units and exact representations suitable for those units.
- Rows participating in optimistic concurrency have a monotonically advanced version. A stale command fails without partially applying an action.
- Idempotency records preserve a bounded key, canonical request hash and outcome in the same command transaction. Confirm exact key scope from implementation; the proposed scope must include business and command identity and prevent replay across principals.
- Allocation totals are reconciled transactionally against available balances. Cross-row total limits need locking or equivalent serializable logic; a simple row check constraint cannot enforce every aggregate.
- Posted/reviewed facts are corrected with revision, reversal or explicit amendment. Deletion is not a default financial correction mechanism.
- Custom fields have versioned definitions, types and visibility. They cannot override money arithmetic, tenant scope, lifecycle or required evidence.

Application validation explains failures; SQL constraints defend invariant violations through other paths. Row-level security is defense in depth and must be tested with restricted runtime roles, including privileged-role bypass risks. Neither feature is verified merely by appearing in a proposed model.

## Dictionary evolution
Every migration should link its affected requirement/decision, data backfill, verification and rollback or forward-repair plan. Record old/new field meaning and unit changes. Do not infer production schema from screenshots or silently reinterpret historical minor units. New agents should consult [business-suite sources and agent handoff](<business-suite sources and agent handoff.md>) before importing legacy IDs or interpreting a demo table as the final domain.


### Actual migration subset — 2026-10-23
Source `db/migrations/001_work_money.sql` creates `suite_users`, `businesses`, `memberships`, `business_modules`, `membership_grants`, `jobs`, `job_assignments`, `expenses`, `command_receipts`, and `audit_events`; migration runner also manages `suite_schema_migrations`. Tenant tables use `business_id` constraints/policies. Jobs and expenses use integer minor amounts, versions and explicit states; audit writes are immutable through the runtime path. Actual API expense projections additionally include nullable `reviewReason`; workspace may include an authorized active-member roster.

These tables implement only the bounded slice. The conceptual commercial, party, payment, reimbursement, inventory, time/trip and evidence objects above remain proposed/pending. Database and API source/evidence: [business-suite roadmap](<business-suite roadmap.md#actual-implementation-evidence>), [db/README.md](/Users/fabiel/Desktop/business-suite/db/README.md) and NOTE-007 2026-10-23 Business Suite foundation report (Obsidian reference).

## Local persistence added by NOTE-008
Offline-first native/browser delivery introduces a **local read snapshot and pending command store**, not a second authoritative order/payment database. The target local scope includes environment/API origin, business, actor and device/install context. Adapter storage must isolate these dimensions and prevent replay under another identity.

The inspected shared client has `Snapshot{workspace,jobs,expenses,fetchedAt}` and `LocalState{schemaVersion:1,snapshot,commands,blockedReason,lastSyncAt}`. Commands contain stable `id`, typed kind (`expense.submit|job.close`), path/body, local creation time, `queued|conflict|rejected` status and optional message. The command key becomes the server idempotency key. Job close retains the observed server version; expense payer is still server-derived. Full exact types and their evidence level are in [business-suite offline and multiplatform](<business-suite offline and multiplatform.md>).

Proposed constraints: atomic local enqueue before send; serialized local updates; schema migration without dropping pending work; no tokens in payloads; confirmed snapshot separate from unsent intent; acknowledgement/result merge plus queue removal atomic. A local row is not a submitted/approved/paid server expense. Device capture time cannot establish authoritative ordering or accounting recognition.

Native SQLite and browser IndexedDB require distinct adapters implementing the same storage contract. A shell service worker stores app assets, not unrestricted business API responses. Future receipt blobs need private local references, capacity/retention and upload lifecycle; time/trip records need their own typed sync contracts. Exact live-user cache expiry, encryption and purge policies remain unresolved; current work is fictional demo only. These local structures do not alter NOTE-007's historical PostgreSQL table inventory.

## Desktop storage and lifecycle
NOTE-009 adds Windows/macOS clients using the shared confirmed-snapshot/pending-command types in IndexedDB under an application-controlled persistent Electron profile. This is separate storage from the browser origin and mobile SQLite; it is not another authoritative business database or a shared-filesystem synchronization system.

Profile identity, environment and tenant/actor scope must remain stable and explicit. Keep application assets/executable separate from the mutable profile. A package update, product rename or signing/distribution change must not accidentally select a blank profile and strand pending work. An explicit profile migration needs source/target identity, supported schema, atomic/recoverable transfer and verification of queued command IDs/versions. Never merge two account queues because their customers have the same name.

Record schema version and last synchronization; preserve confirmed amounts and pending intent separately. No desktop installation/uninstall routine should silently clear unsynced records. The implementation documents separate `Business Suite Desktop/setup` and `/demo` profile roots under platform application data, with persistent Electron sessions. Installer/uninstaller retention behavior, encryption/backup and profile-migration recovery remain unverified; see BS-DEC-029/030/031 and [business-suite desktop applications](<business-suite desktop applications.md>).
