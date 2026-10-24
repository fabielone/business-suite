# Initial implementation contract — 2026-10-23

Engineering defaults for the first local slice, not a finalized complete product specification.

## Structure
npm workspaces: `apps/web` (`@suite/web`, React/Vite), `apps/api` (`@suite/api`, Fastify/TypeScript), `packages/core` (`@suite/core`, shared domain helpers). PostgreSQL migrations in `db/migrations`. Root owns dependency installation and lockfile. TypeScript 5.9.x initially for compatibility, Node 22.12+ recommended (current environment 25.5). No changes to existing portfolio backend.

## First slice and common HTTP contract
Base `/v1` on API, web accesses `/api/v1` through Vite proxy (API port 4310; web port 5178, both 127.0.0.1). JSON uses camelCase. Money is integer MXN centavos; multi-currency conversion is deferred. UUIDs are opaque.

- `GET /v1/workspace`: `{business:{id,name,currency},user:{id,name},modules:string[],permissions:string[],members?:{id,name}[],demo:boolean}`. Request header `x-business-id` required for business routes; local demo accepts documented fixture default. Real server never guesses a business. `members` is returned only for a business-scoped job creator; it contains active member IDs/names for assignment. Demo header `x-demo-user` is `manager` or `worker` and has NO effect in real server.
- `GET /v1/jobs`: `{jobs:[{id,title,customerName,status,agreedPriceMinor?,currency,assignedUserIds,version}]}`. Values `draft|scheduled|in_progress|completed`. Worker money fields omitted unless authorized.
- `POST /v1/jobs`: `{title,customerName,agreedPriceMinor,currency,assignedUserIds}` creates job (authorized). Returns `{job}`.
- `POST /v1/jobs/:id/close`: `{version}`; requires completion privilege and matching version. Returns `{job}`.
- `GET /v1/expenses`: `{expenses:[{id,jobId,description,amountMinor,currency,payerUserId,status,missingReceiptReason,version,reviewReason?}]}`; `submitted|approved|rejected`; own records for worker, business scope for reviewer.
- `POST /v1/expenses`: `{jobId?:string,description,amountMinor,currency,missingReceiptReason}`; first slice missing-receipt workflow only, always submitted for review. Payer set from authenticated identity. Real receipt upload deferred, not simulated as secure storage.
- `POST /v1/expenses/:id/review`: `{version,decision:'approve'|'reject',reason?:string}`; reviewer access; self-approval blocked as conservative engineering default pending user policy. Returns `{expense}`. Approval does not send money.
- Commands require `Idempotency-Key` UUID/string (bounded) to make retries safe. Keys are scoped to business, authenticated actor and command family. The normalized payload is canonically hashed; replaying the same intent returns the stored result, while a changed normalized payload returns 409. Current access is still checked before replay.
- Errors `{error:{code,message}}` with 400 invalid, 401 unauthenticated, 403 denied, 404 inaccessible record, 409 conflict; safe transport failures preserve 413 (oversized) and 415 (unsupported media). UI preserves failed draft and uses explicit loading/empty/error/denied states.
- Permissions: `work.jobs.read`, `work.jobs.create`, `work.jobs.close`, `work.prices.read`, `money.expenses.read`, `money.expenses.submit`, `money.expenses.review`. `resources` and `crm` are planned modules, not functional menus implying completion.

## Security and modes
Real API verifies GoTrue-compatible JWT issuer/audience/expiry via configured JWKS or server-only secret, uses `sub`, then loads active membership and privilege/scope from DB; never trusts role headers or token role claims as business grants. Business isolation in all query paths, assignments for worker scope, explicit forbidden tests. No public DB/PostgREST credentials.

Explicit local demo entry runs the same services against ephemeral PGlite fixture database, bound only to loopback, selected test identity restricted to demo process. No persistence across restart promised. Browser banner names demo and limitations. Real server cannot activate demo via request headers or auth failures. Frontend initial build is demo only (no sign-in UX yet); live configuration must show setup requirement rather than silently use fixtures.

## Ownership and evidence
Backend owns API/core/migrations/backend tests; frontend owns web; docs agent owns vault project notes. Root integrates and documents actual results. PostgreSQL server and concurrency certification are separate from PGlite checks. No claim of full replacement readiness, real receipts, payments, payroll, tax or deployment.
