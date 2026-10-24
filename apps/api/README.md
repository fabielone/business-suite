# Work and Money API starter

This implements the bounded slice in docs/implementation-contract.md: jobs, direct authorized completion, and missing-receipt expense submission/review. Approval does not reimburse or pay anything. Expense cost never changes the agreed job price.

## Local demo

From the repository root:

    npm run build -w @suite/core
    npm run dev:demo -w @suite/api

The demo binds **127.0.0.1:4310**, initializes an in-memory PGlite database using real migrations, and calls the same command services as the PostgreSQL API. Restart resets all data. It never reads DATABASE_URL.

Use x-demo-user: manager or worker; omitted selection means manager only in this explicit demo process. Unknown identities fail. GET /v1/workspace returns demo: true and the fixture business; real mode always returns demo: false. The workspace includes members only for business-scoped job creators.

Exported DEMO_IDS lives in src/demo-fixtures.ts:

| Fixture | UUID |
|---|---|
| Default business | 10000000-0000-4000-8000-000000000001 |
| Manager | 20000000-0000-4000-8000-000000000001 |
| Worker | 20000000-0000-4000-8000-000000000002 |
| Worker's assigned job | 30000000-0000-4000-8000-000000000001 |
| Worker's submitted expense | 40000000-0000-4000-8000-000000000001 |

Other invented members/business records exist to exercise isolation. Workers see assigned jobs and their own expenses, with agreed prices omitted; the manager sees business records and can review another payer's claim. These are conservative fixture privileges, not finalized role policy.

Demo accepts loopback peers, documented localhost hosts, and browser origins on ports 5178/4310 only. Vite proxy must set changeOrigin: true. No real receipt files, payment/provider requests, or auth sessions are simulated.

## Real API

Build core and API, run migrations separately as described in db/README.md, then from root:

    node --env-file=.env apps/api/dist/server.js

Required names: DATABASE_URL, AUTH_ISSUER, AUTH_AUDIENCE, and exactly one of AUTH_JWKS_URL or AUTH_JWT_SECRET. The secret must be at least 32 bytes; HS256 is accepted only with the configured server-only secret. JWKS mode accepts RS256/ES256/EdDSA and requires HTTPS except explicitly loopback development. Subjects must be UUIDs; issuer, audience, signature and mandatory expiry are verified. Token role claims and demo/role headers never grant business privileges.

Optional: API_HOST (127.0.0.1), API_PORT (4310), and comma-separated exact API_ALLOWED_ORIGINS. Real requests require a Bearer token and X-Business-Id; no business is guessed. All commands require Idempotency-Key (1–160 printable, non-space ASCII characters). Scope includes business, authenticated actor and command family; a changed normalized payload conflicts. Target mutations recheck current access before returning a stored result.

Validation failures are 400, missing/invalid sign-in 401, permissions 403, inaccessible records 404, state/version/idempotency conflicts 409; transport errors preserve 413/415 with safe messages. All errors use {error:{code,message}}. Bodies are limited to 64 KiB.

The real server fails closed for missing auth and refuses privileged database connections. It does not automatically migrate or create memberships. A functional real sign-in, user provisioning/invitations, production deployment, full receipt workflow, ordinary direct posting, payments/reimbursements, time, trips, CRM and Resources remain future work.

## Checks

    npm run build -w @suite/core
    npm run build -w @suite/api
    npm test -w @suite/api

Tests cover business/user scope, active grants and modules, price redaction, reason-required claims, self-approval denial, versions, idempotent replay, rollback including audit, actual PGlite restricted-role RLS, JWT failure/role spoofing, and demo host/origin limits. Embedded tests are not real PostgreSQL concurrency certification.
