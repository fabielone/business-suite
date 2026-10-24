# Contributing and agent handoff

Public contributors should start with [CONTRIBUTING.md](../CONTRIBUTING.md), repository `AGENTS.md` and the [portable requirements](requirements/README.md). Private Obsidian or infrastructure access is not required. The coordination procedure below is for maintainer agents with vault access; external contributors use GitHub issues/pull requests and the maintainer reconciles accepted requirements changes into the canonical notes. Repository source and actual test output establish implementation facts. Human instructions override stale notes.

## Start a scoped change

1. Inspect the current task board, task record and repository status. A proposed backlog item is not by itself a human assignment.
2. Claim authorized work using the vault protocol when available, with unique session ID, timestamp, intended paths and acceptance criteria. If the vault is unavailable, record a local handoff and do not claim to have synchronized it.
3. Read relevant requirement IDs, open decisions and actual code. Ask for a decision only when it blocks the dependent behavior; continue independent work. Do not treat a UI-preselected option as an answer.
4. Prefer one complete user flow with relevant negative cases. Keep domain commands separate from UI and provider adapters.
5. Run type checks/build plus tests that demonstrate the new behavior and its important failure cases. For UI, inspect desktop and narrow layouts and interactions.
6. Document files, checks actually run, unresolved risks, local vs deployed evidence, migrations and rollback. Update implementation inventory and the canonical task/report. Preserve other agents' changes.

## Invariants to preserve

- One active business context and membership checked for every request. An object ID or guessed UUID grants no access. Membership revocation and module disabling must take effect on backend requests.
- Module visibility, action capability, record scope and sensitive-field access are separate checks. Avoid making every employee an administrator for convenience.
- Work may begin without CRM. An order/job is useful context, but company expenses can exist without one. One job can eventually have several visits, trips, time entries and payments; those have distinct lifecycles.
- Agreed selling price, estimates, actual costs, money collected, money due and reimbursements are separate. No double expense on reimbursement. Approval does not execute a transfer or establish that it happened.
- Worker-paid business expenses create reimbursement eligibility after required approval. Mixed personal amounts are excluded. A missing receipt requires a reason and manager review even when ordinary direct posting is permitted.
- Authorized workers may close jobs. Closing a job neither marks customer balances paid nor silently resolves expenses.
- Integer minor units plus currency; no binary-float currency arithmetic or silent exchange-rate conversions. Date-only business dates and UTC instants serve different purposes; locale/timezone must be explicit.
- Retriable commands use idempotency and state/version checks. Do not use optimistic client totals as financial authority. Posted financial corrections need linked reversals or adjustments rather than destructive history edits.
- Receipt access must be private and authorized independently from the UI. OCR is a suggestion, not approval or a tax-validity guarantee.
- Never expose database/service credentials in a Vercel bundle or native client. Live auth failure must never switch to demo.

## Review lanes

**Product/domain reviewer:** compare flows against confirmed requirement IDs; identify accidental defaults represented as agreed policy; check general work and meal service examples.

**Security/data reviewer:** cross-business and cross-user access, revocation, file access, commands, concurrency, audit trail, financial precision and correction semantics.

**Frontend reviewer:** action and field visibility, keyboard/focus, phone layout, failed-draft preservation, conflict recovery, honest loading/offline/setup states.

**Operations reviewer:** versioned migrations, backup/restore, environment/secret separation, runtime DB permissions, real issuer compatibility, exact allowed origins and observability before deployment.

Do not add arbitrary plugins, workflow builders or new services just to satisfy hypothetical future clients. First establish a concrete use case and a bounded extension point. Offline-first Android/iOS, Windows/macOS desktop applications and browser access are required. Desktop source uses Electron with bundled screens and persistent offline storage; trip logs still do not imply continuous GPS tracking. Read `docs/offline-contract.md`; validate local transactions, retry identity, permission loss and device-storage behavior in addition to connected API flows.
