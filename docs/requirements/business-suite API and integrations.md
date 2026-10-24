---
tags: [business-suite, architecture, api, integrations]
updated: 2026-10-23
---
# Business Suite API and integrations

← [business-suite hub](<business-suite hub.md>) · [business-suite architecture](<business-suite architecture.md>) · [business-suite migration](<business-suite migration.md>)

The table below transcribes the bounded `E1` implementation contract. It is a specification, not test evidence. The live source remains [docs/implementation-contract.md](/Users/fabiel/Desktop/business-suite/docs/implementation-contract.md); later verified deviations require deliberate reconciliation, not silent documentation drift.

## Initial HTTP contract
API base `/v1`; the local web client uses `/api/v1` through Vite's proxy. API and web bind to loopback at ports 4310 and 5178 respectively. JSON is camelCase; opaque UUIDs are not authorization. Monetary values are integer MXN centavos and versions are optimistic concurrency tokens.

| Method and path | Request or query contract | Result and authority |
|---|---|---|
| GET `/v1/workspace` | Authenticated business context; explicit local demo context only in demo | Business/user, enabled modules, permissions, `demo` flag, optional `members` roster only for business-scoped job creators |
| GET `/v1/jobs` | Authorized business and record scope | `{jobs:[...]}`; omit price fields when unauthorized |
| POST `/v1/jobs` | `title, customerName, agreedPriceMinor, currency, assignedUserIds` | `{job}`; create privilege and accessible assignees |
| POST `/v1/jobs/:id/close` | `version` | `{job}`; close privilege, record access, matching version |
| GET `/v1/expenses` | Worker own scope or authorized reviewer business scope | `{expenses:[...]}` |
| POST `/v1/expenses` | Optional `jobId`, `description, amountMinor, currency, missingReceiptReason` | Submitted expense; payer from authenticated subject |
| POST `/v1/expenses/:id/review` | `version, decision` approve/reject, optional `reason` | `{expense}`; reviewer access; E1 self-approval denied |

Jobs return `id,title,customerName,status,agreedPriceMinor?,currency,assignedUserIds,version`. Job states are `draft|scheduled|in_progress|completed`; listing states does not promise endpoints for every transition. Expenses return `id,jobId,description,amountMinor,currency,payerUserId,status,missingReceiptReason,version,reviewReason?`; states are `submitted|approved|rejected`.

`x-business-id` is required for real business routes and validated against membership. The real server must not guess a business. The local demo can use a documented fixture default and `x-demo-user: manager|worker`. That header has no power in the real server and must never become an authentication bypass.

Source inspection confirms that the initial API blocks self-approval but permits an authorized reviewer to reject their own submission; the current UI suppresses both own-review actions. This is an implementation default, not final human policy. Review notes are returned and shown to authorized users. The API test covers own-approval denial; no own-rejection UI flow is claimed.

All commands require a bounded `Idempotency-Key`. Repeating the same key and body returns the same result; changed body with the same key returns 409. Implemented key scope is business, actor and command family, with a canonical hash of normalized input and stored result in the same transaction. Current access is rechecked before replay; tests exercise the result and rollback. Errors use `{error:{code,message}}`: 400 invalid, 401 unauthenticated, 403 denied, 404 inaccessible object, 409 conflict, plus safe 413/415 transport failures. Unknown routes use normalized404. Sensitive internals and another business's data must not appear in messages.

## Authentication and mode boundary
Real mode verifies a GoTrue-compatible JWT's issuer, audience and expiry using configured JWKS or a server-only secret. It uses the verified `sub` to load active membership and grants from the database. A token's role claim and client role headers are not business permissions. The frontend first slice has no production sign-in UX; live configuration must show setup requirements instead of silently falling back to demo fixtures.

The demo is a separate explicit local entry with ephemeral PGlite fixtures and the same domain services, not a deployed authentication mode. It binds only to loopback, has no promised persistence across restart and must label its limitations. Real authentication failure never activates demo.

## Command and transaction contract
A proposed consequential command runs authorization and domain checks, locks or versions affected records, writes state plus audit/idempotency/outbox records, and commits on one backend-owned PostgreSQL connection under a restricted role and transaction-local business scope. SQL constraints reinforce typed invariants. A SQL RPC can implement an entire command as an alternative, but must not duplicate competing business logic.

Several HTTP calls to PostgREST do not form one transaction. Direct table writes must not bypass the same rules. First-slice migration and transaction implementation need inspection before the proposed design is described as verified.

A future outbox is a durable row written with the business transaction for work that must be sent later. A worker claims it, calls an external service with a stable posting identity, stores the result and retries safely. An inbox deduplicates provider events and records their outcome. Delivery is at least once; reconciliation and recovery handle unknown results, duplicates and out-of-order events. Do not promise exactly-once delivery.

## Future integration boundaries
| Integration | Confirmed need or proposed role | Unsettled choices |
|---|---|---|
| Professional bookkeeping | Human requirement for professional integration; authoritative statutory records live in one chosen system | Provider, chart mapping, posting approvals, reconciliation |
| Payroll | Human future requirement; time/expense inputs may be exported under permission | Provider, pay rules, contracts, consent and correction flows |
| Mexico fiscal/tax service | Human future requirement; adapter delegates regulated document lifecycle | Accountant/PAC/provider, tax rules, cancellation and status handling |
| Payments/bank reconciliation | Supports actual receipt/payment evidence and allocation | Provider, cash controls, transfer confirmation, refunds |
| Files/receipts | Private evidence storage with parent-record authorization | Hosting, retention, scanning, size/type limits |
| Notifications | Explain actionable events without exposing sensitive details | Channels, consent, retry/quiet rules |
| Legacy CocinaCostos/Salad | Preserve existing documented integration until explicit cutover | Approved new consumer, contract mapping and migration scope |

Quotes and operational cost estimates are not posted accounting entries. Choose one authority for posted books, either an explicitly adopted ledger or the external professional system; do not keep two authoritative balances with bidirectional synchronization. Maintain source IDs, revision, external IDs, posting state and reconciliation evidence. A failed export leaves a visible unresolved item, not a silently successful accounting claim.

Cash is supported conceptually alongside transfers; electronic provider confirmation rules must not exclude cash operators. Detailed receipt/reimbursement commands are future contracts, not implemented by expense approval.

## Compatibility and recovery
Version external payloads and document schema changes, retry behavior, ordering assumptions, authentication scopes and error classifications. Keep local command IDs distinct from external event IDs. Reprocessing should preserve traceability without duplicating payments or posted documents. A dead-letter/retry screen needs restricted recovery actions and audit history; deletion of a failed event is not financial reconciliation.

No new consumer has been connected to the CocinaCostos/Salad API, and no shared backend or production endpoint change is claimed. [business-suite migration](<business-suite migration.md>) defines authority transfer separately from writing an adapter. Actual endpoint/test evidence should be linked by root in [business-suite roadmap](<business-suite roadmap.md>) after implementation review.


### Inspected implementation
The paths and final checks are recorded in [business-suite roadmap](<business-suite roadmap.md#actual-implementation-evidence>) and NOTE-007 2026-10-23 Business Suite foundation report (Obsidian reference). `/healthz` is also implemented. Business writes/audit/command receipts are atomic in the tested PGlite transaction path. No outbox/inbox or external worker is implemented in this slice. The real pg adapter exists; live PostgreSQL execution remains unrun.
