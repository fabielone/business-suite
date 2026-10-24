---
tags: [business-suite, quality, testing]
updated: 2026-10-23
---
# Business Suite quality and verification

← [business-suite hub](<business-suite hub.md>) · [business-suite roadmap](<business-suite roadmap.md>) · [business-suite security privacy and operations](<business-suite security privacy and operations.md>)

The canonical execution checklist is in NOTE-007 (Obsidian reference). This note specifies meaningful verification and evidence levels; it is not a second completion checklist. Final bounded implementation evidence was added by the coordinating agent on 2026-10-23; the broader test catalog below remains future requirements where the feature is absent.

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
| BS-TEST-012 | Demo restarts or live frontend lacks auth setup | Demo limitation is clear; no durability promise or silent fixture fallback |

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
Root should link the dated NOTE-007 completion/partial report here, plus actual commands, test totals, environment, UI checks and remaining blockers. Keep failed/unrun checks visible. The source of actual implementation truth is inspected code and executed evidence, not a checkbox inferred from these proposed scenarios.

**Evidence record:** NOTE-007 2026-10-23 Business Suite foundation report (Obsidian reference); [verification.md](/Users/fabiel/Desktop/business-suite/docs/verification.md). Type checks and builds passed; 11 backend tests passed in PGlite including restricted-runtime-role command flows and RLS/context-reset tests; 8 connected Chromium scenarios passed. Screenshots at1440/390 were visually inspected and320px overflow checked. A focused layout rerun passed after copy spacing correction. Real-server missing-auth startup failed closed as expected. No real receipt storage, actual payment, production authentication UX, live PostgreSQL concurrency/restore or deployment is certified by these checks. Browser-test teardown was corrected after the first passing run; final runs exited normally. No hosted CI execution occurred.
