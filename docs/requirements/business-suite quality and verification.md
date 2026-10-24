---
tags: [business-suite, quality, testing]
updated: 2026-10-23
---
# Business Suite quality and verification

← [business-suite hub](<business-suite hub.md>) · [business-suite roadmap](<business-suite roadmap.md>) · [business-suite security privacy and operations](<business-suite security privacy and operations.md>)

The current canonical execution checklist is in NOTE-008 (Obsidian reference); NOTE-007 (Obsidian reference) preserves the completed foundation checklist. This note specifies meaningful verification and evidence levels; it is not a second completion checklist. Final bounded implementation evidence was added by the coordinating agent on 2026-10-23; the broader test catalog below remains future requirements where the feature is absent.

## Evidence levels
A requirement is a human need. A contract is intended behavior. Source inspection identifies an implementation mechanism. An automated test demonstrates a specific controlled case. A manual UI check demonstrates an observed interaction/viewport. A real PostgreSQL integration/concurrency test checks server behavior. A restore drill checks a particular recovery procedure. A supervised operational pilot checks the tested workflow with actual operators under approved conditions. None alone establishes all other levels or universal business fit.

Every reported result should identify date, command or scenario, environment/runtime/database, pass/fail, material limits and evidence location. Do not summarize unavailable tests as passing. PGlite uses useful PostgreSQL-compatible mechanisms but does not certify a separate production PostgreSQL server, network deployment, roles or multi-process concurrency.

## Foundation scenarios
| ID | Intended scenario | Observable outcome |
|---|---|---|
| BS-TEST-001 | Manager creates job with valid members and exact MXN price | One scoped job; authorized projection; traceable command result |
| BS-TEST-002 | Assigned authorized worker closes job | Completion succeeds without a universal manager gate; stale version conflicts |
| BS-TEST-003 | Worker reads jobs without price grant | Price omitted from response, not merely visually hidden |
| BS-TEST-004 | Worker submits missing-receipt expense | Reason required; payer comes from authenticated identity; status submitted |
| BS-TEST-005 | Reviewer approves/rejects another user's submission | Permitted versioned transition; no money sent or paid label |
| BS-TEST-006 | User attempts self-approval under E1 | Denied without mutation; this tests a conservative default, not final policy |
| BS-TEST-007 | Same command is retried, then key reused with changed payload | Same intent yields one result; altered intent returns conflict |
| BS-TEST-008 | User guesses another business's job/expense/member ID | Lists/details/commands/relationships deny access without data leakage |
| BS-TEST-009 | Real mode receives forged role/demo header, bad issuer/audience/expiry or inactive membership | No privilege escalation and no fallback to fixtures |
| BS-TEST-010 | UI experiences invalid input, timeout, denied record and stale conflict | Explicit state; useful message; safe draft preservation; no false success |
| BS-TEST-011 | Narrow phone and desktop viewport, keyboard navigation | Usable layouts, visible focus/labels/errors, no accidental sensitive fields |
| BS-TEST-012 | Demo API restarts or live frontend lacks auth setup | API fixture limitation is clear; no server durability promise or silent fixture fallback; NOTE-008 client persistence has separate tests |

Some outcomes require implementation-specific inspection of audit/idempotency behavior. Root must distinguish what was actually checked from the broader intended assertion. Backend unit tests, API integration tests, build/type checks and interactive browser checks should report their separate scopes.

## Later capability scenarios
| ID | Trigger and relevant requirements | Expected invariant |
|---|---|---|
| BS-TEST-101 | Mixed receipt includes personal items — BS-MONEY-002 | Only business portion affects cost and employee eligibility |
| BS-TEST-102 | Direct-poster lacks receipt — BS-MONEY-003/004 | Reason and manager review still required |
| BS-TEST-103 | Group two expenses, partially reimburse, then retry — BS-MONEY-005/006 | One payment, correct allocations, remaining balance, no second expense |
| BS-TEST-104 | Record customer deposit and partial receipt — BS-MONEY-008 | Outstanding explained by obligations/credits/allocations; method selection alone is not receipt |
| BS-TEST-105 | Actual costs rise after agreed quote — BS-MONEY-007 | Job cost changes; agreed customer price does not change automatically |
| BS-TEST-106 | Timer/manual corrections and trip shared across jobs — BS-WORK-003/004 | Traceable units/corrections; allocations do not duplicate total cost |
| BS-TEST-107 | Quote amendment or rework after acceptance | Accepted revision preserved; rework does not automatically charge or fulfill twice |
| BS-TEST-108 | One payer orders six portions; multiple orders share a food batch | Customer/order cardinality correct; batch costs/fulfillment allocated explicitly |
| BS-TEST-109 | Module retirement with open work, claims and refunds | New intake can stop while legitimate closeout remains possible |
| BS-TEST-110 | Integration retries, duplicate/out-of-order webhooks and unknown provider result | Stable external identity, safe recovery and reconciliation; no duplicate posting |
| BS-TEST-111 | Import twice, reconcile opening balances, roll back cutover rehearsal | Traceable legacy mapping, no duplicate liabilities, recoverable authorities |
| BS-TEST-112 | Restore isolated backup including pending outbox and evidence refs | Business records and recovery state reconciled before resuming sends |

These scenarios apply at the stage implementing the capability. The initial foundation must not wait for full food batches, statutory integration or every retirement workflow; later features must not inherit an unearned pass from the foundation.

## Test data and practical measurements
Use fictional people, businesses, customers and receipts. Cover positive, zero, invalid/negative and upper-bound amounts; empty/oversized strings; inaccessible associations; missing/disabled grants; stale version; repeated request; and concurrent competing allocations when those exist. Test cross-business denial with separate fixtures rather than assuming one demo business proves isolation.

Measure actual operator task completion, errors, duplicate entry, unresolved review items and ability to explain outstanding amounts. Establish a baseline before claiming improvements. Tiny food and physical-service trials probe different relationships; they do not establish product-market fit or large-enterprise capacity. Performance budgets need representative data and measured connection/query behavior, not invented benchmark scores.

## Final evidence insertion point
Root should append the dated NOTE-008 report and actual commands, test totals, environment, UI/native checks and remaining blockers here, preserving the NOTE-007 evidence below. Keep failed/unrun checks visible. The source of actual implementation truth is inspected code and executed evidence, not a checkbox inferred from these proposed scenarios.

**Evidence record:** NOTE-007 2026-10-23 Business Suite foundation report (Obsidian reference); [verification.md](/Users/fabiel/Desktop/business-suite/docs/verification.md). Type checks and builds passed; 11 backend tests passed in PGlite including restricted-runtime-role command flows and RLS/context-reset tests; 8 connected Chromium scenarios passed. Screenshots at1440/390 were visually inspected and320px overflow checked. A focused layout rerun passed after copy spacing correction. Real-server missing-auth startup failed closed as expected. No real receipt storage, actual payment, production authentication UX, live PostgreSQL concurrency/restore or deployment is certified by these checks. Browser-test teardown was corrected after the first passing run; final runs exited normally. No hosted CI execution occurred.

## Offline and native scenario catalog
These are intended verification gates, not a claim of passing tests. “Initial” means the supported demo slice must be checked; “later” applies before the corresponding full/live capability launches. NOTE-008 owns execution checkboxes.

| ID | Scope | Scenario and observable result |
|---|---|---|
| BS-TEST-201 | Initial | Enqueue offline expense/close: durable local write completes before any network send or “saved” confirmation; confirmed snapshot remains distinct |
| BS-TEST-202 | Initial | Restart/reload after local save: queue and previously authorized work reopen without connectivity; no invented first-use cache |
| BS-TEST-203 | Initial | Restore connection or manually sync: same command ID/body reaches server; acknowledgement and result update atomically |
| BS-TEST-204 | Initial | Server commits but acknowledgement is lost: replay same key produces one server mutation and reconciles the pending item |
| BS-TEST-205 | Initial | Another device edits/closes the job: old version becomes visible conflict; no automatic version replacement or replay |
| BS-TEST-206 | Initial | Membership/grant revoked: server denies; protected snapshot is cleared and replay locked; queue cannot move to another identity |
| BS-TEST-207 | Initial | Switch business/user/environment or restart demo API: scoped storage and generation guard prevent wrong-scope or old-fixture replay |
| BS-TEST-208 | Initial | Two tabs/repeated sync requests or local write interruption: adapter serializes updates without lost intents; server idempotency prevents duplicates |
| BS-TEST-209 | Initial | Unsupported local schema or storage write failure: clear unsaved/needs-upgrade state; no destructive reset or false successful save |
| BS-TEST-210 | Initial | Queued expense is shown: not approved/paid; job pending close is not falsely confirmed complete; create/review actions explicitly require online access |
| BS-TEST-211 | Initial native evidence | Record exact Android/iOS source/type/bundle/build checks; test normal restart/offline/reconnect on actual emulator/device before claiming it verified |
| BS-TEST-212 | Initial browser evidence | Test installed/cached shell reopen, IndexedDB persistence, reconnect and updates; identify browser/version and limits, not only responsive rendering |
| BS-TEST-213 | Later live readiness | Exercise real login/expiry/logout, local lock, device loss, encryption/retention, identity switch and recovery with approved policy |
| BS-TEST-214 | Later feature readiness | Receipt blob upload failure, timer interruption, trip allocations and money conflicts obey their own typed contracts without auto-merging financial facts |
| BS-TEST-215 | Later release readiness | Upgrade local schema/app shell with pending work, storage eviction/capacity and recovery; no silent pending-command loss |

A JS bundle or type check is useful native evidence but is not an installed Android/iOS test, signed build, store release or secure-storage audit. Browser offline tests do not certify native SQLite behavior. The shared client source was inspected, but its adapter and runtime behavior require the corresponding actual tests. Root should record which gates were run, failed or deferred and why.

**NOTE-008 evidence:** NOTE-008 2026-10-23 Offline and native foundation report (Obsidian reference).16 shared-engine,12 API,2 native parsing,8 connected browser and2 built-shell offline scenarios pass; type/build/export/compatibility/format checks pass. Native runtime/UI/SQLite lifecycle, real auth, live PostgreSQL and signed distribution are unverified. Five high Expo toolchain audit entries remain release follow-up work. The requirement is full offline-first multiplatform operation; this verified subset remains only a foundation.
