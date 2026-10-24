# Database boundary and migrations

This schema belongs only to Business Suite. On 2026-10-24, `NOTE-010` provisioned it in the independent `business_suite` database on the existing shared Docker host. The application server still does not create databases, apply migrations or seed identities on startup. [Shared-host operations](../docs/shared-backend.md) describes the explicit operator procedure; [container setup](../docs/container.md) explains the compiled migration command.

The same SQL migration runs in ephemeral PGlite demo/tests and in real PostgreSQL through the pg adapter. Every command uses one transaction. The migration runner resolves paths from its own file location, records checksums, refuses changed applied migrations, and serializes migration application with a table lock.

From the repository root, after installing dependencies and building core:

    node --env-file=.env.migrations --import tsx apps/api/src/migrate.ts

The private migration environment supplies DATABASE_URL for a schema administrator. Do not commit that file or reuse that administrator as the runtime account. Migration creates schema only: no demo seed, real users, businesses, grants, passwords, or login credentials.

The deployed runtime login is `business_suite_runtime`: `NOINHERIT`, no role memberships, no table ownership, no `SUPERUSER`, no `BYPASSRLS`, no database/role creation, no replication, and a ten-connection limit. Its credential is private operator state. The [scoped deployment script](../ops/deploy_shared.py) creates it and applies the following application privileges explicitly after migrations:

    GRANT USAGE ON SCHEMA public TO business_suite_runtime;
    GRANT SELECT ON suite_schema_migrations, suite_users, businesses,
      memberships, membership_grants, business_modules TO business_suite_runtime;
    GRANT SELECT, INSERT, UPDATE ON jobs, expenses, command_receipts TO business_suite_runtime;
    GRANT SELECT, INSERT ON job_assignments TO business_suite_runtime;
    GRANT INSERT ON audit_events TO business_suite_runtime;

It also receives `CONNECT` to its own database and a ten-second statement timeout. New migrations need review for any additional grants; do not solve a missing grant by switching the API to the schema owner. The deployed schema belongs to `business_suite_owner`; the migration session assumes that app owner separately from the API account.

On another installation, provision an equivalent distinct runtime login with explicit table grants, configure its URL in the real API environment, and separately map verified auth subjects to `suite_users`, active memberships and explicit grants. The connection user must not own public application tables, inherit their owner role, have `SUPERUSER`, or have `BYPASSRLS`; startup refuses those cases. Do not expose these database credentials to clients. No Suite PostgREST service or route is deployed; legacy unused REST roles receive no Suite table privileges.

RLS checks transaction-local suite.business_id; the API sets it for each transaction and independently verifies active user membership, enabled modules, actions and record scope. These policies are not a replacement for the API checks. Do not expose arbitrary SQL or direct table writes to end users.

Audit rows are append-only via the runtime path. Administrative access, backup restoration and schema changes still require separate operational controls. The application deliberately cannot edit membership/grant/module tables.

Tests use restricted-role execution in PGlite plus [opt-in real PostgreSQL verification](../tests/postgres/README.md). Nine real-PostgreSQL groups passed for `NOTE-010`, including concurrent retries, version races, permission changes, RLS and pooled transaction reset. They ran against a disposable test database with invented records and a process-generated signing key; they do not by themselves prove deployed Auth login, backup recovery, receipt storage or client readiness. Keep those evidence categories separate in [verification](../docs/verification.md).
