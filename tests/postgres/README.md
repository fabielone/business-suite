# Real PostgreSQL verification

This opt-in test uses the actual `pg` connection pool and API in real JWT mode. It supplements the PGlite unit tests; it does not call a deployed Auth provider or prove that real client sign-in is ready.

An operator must first provision an **empty, disposable database** named `suite_test_<suffix>` and a separate restricted login on the intended PostgreSQL server. The administrator URL must allow migrations and fixture writes despite forced RLS. The runtime login must not own/inherit the database owner or have superuser, bypass-RLS, database-creation or role-creation rights. Do not reuse production application data or credentials.

Supply the two URLs through a private environment file or secret injection:

```text
SUITE_TEST_DATABASE_URL=<administrator URL for the disposable database>
SUITE_TEST_RUNTIME_DATABASE_URL=<restricted login URL for the same database>
```

After installing dependencies and building core, use a supported Node release from the repository root:

```sh
npm run build --workspace @suite/core
node --env-file=/absolute/private/path/suite-test.env --import tsx tests/postgres/verify.ts
```

The script refuses other database names, different host/port/database pairs, identical logins, powerful runtime roles and nonempty public schemas. It runs migrations twice, grants runtime table privileges **only inside that disposable database**, then seeds explicitly invented fixtures. The signing key is randomly generated for this process and is unrelated to deployed authentication.

Nine verification groups cover safe setup; migration stability; real-mode JWT and action checks; 16 concurrent expense retries plus same-key/input collision; 16 concurrent close retries; a two-key job version race; assignment/business/RLS isolation and pooled transaction reset; restricted database privileges; and review races, self-approval denial and current module/membership revocation. Counts verify that successful actions produce one mutation, receipt and audit event, while losing commands roll back.

The script never creates/alters cluster roles, creates/drops databases, reads other app databases, or prints credentials/tokens. It leaves fictional rows in place for inspection. Afterwards, the operator must drop the entire disposable database and its dedicated test login. Each run requires a fresh empty database; do not rerun against the deployment database.

This test does not validate provider login, TLS/gateway routing, deployed process restart, backups/restoration, native clients or full business workflows. Record those checks separately.
