# Database boundary and migrations

This schema belongs only to the new local Business Suite. Nothing provisions, connects to, or modifies the existing portfolio backend automatically.

The same SQL migration runs in ephemeral PGlite demo/tests and in real PostgreSQL through the pg adapter. Every command uses one transaction. The migration runner resolves paths from its own file location, records checksums, refuses changed applied migrations, and serializes migration application with a table lock.

From the repository root, after installing dependencies and building core:

    node --env-file=.env.migrations --import tsx apps/api/src/migrate.ts

The private migration environment supplies DATABASE_URL for a schema administrator. Do not commit that file or reuse that administrator as the runtime account. Migration creates schema only: no demo seed, real users, businesses, grants, passwords, or login credentials.

For a separately provisioned restricted runtime role, the application needs these privileges. These statements are an operator-reviewed example, not run automatically:

    CREATE ROLE suite_api NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO suite_api;
    GRANT SELECT ON suite_schema_migrations, suite_users, businesses,
      memberships, membership_grants, business_modules TO suite_api;
    GRANT SELECT, INSERT, UPDATE ON jobs, expenses, command_receipts TO suite_api;
    GRANT SELECT, INSERT ON job_assignments TO suite_api;
    GRANT INSERT ON audit_events TO suite_api;

Provision a distinct login credential with only the required runtime role, configure its URL in the real API environment, and separately map verified auth subjects to suite_users, active memberships and explicit grants. The connection user must not own public application tables, inherit their owner role, have SUPERUSER, or have BYPASSRLS; startup refuses those cases. Do not expose these database credentials to clients or PostgREST.

RLS checks transaction-local suite.business_id; the API sets it for each transaction and independently verifies active user membership, enabled modules, actions and record scope. These policies are not a replacement for the API checks. Do not expose arbitrary SQL or direct table writes to end users.

Audit rows are append-only via the runtime path. Administrative access, backup restoration and schema changes still require separate operational controls. The application deliberately cannot edit membership/grant/module tables.

Tests use actual restricted-role execution in PGlite as well as normal application routes. They do not certify real PostgreSQL pool/concurrency behavior, production JWT/provider provisioning, backup restoration, receipt storage or deployment readiness. Demo data is invented and ephemeral.
