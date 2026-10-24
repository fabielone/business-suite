import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { buildApp } from '../../apps/api/src/app.js';
import { PostgresDatabase, migrate } from '../../apps/api/src/database.js';
import { DEMO_IDS as ids, seedDemo } from '../../apps/api/src/demo-fixtures.js';

// Deliberately opt-in: this uses real connections and writes invented data to an
// empty, separately provisioned test database. It never creates/drops databases
// or changes cluster roles. The operator removes the entire test DB afterwards.
function testUrl(name: string): URL {
  const raw = process.env[name];
  assert.ok(raw, `${name} is required; no default database is permitted.`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL; its value is intentionally hidden.`);
  }
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'Use a PostgreSQL URL.');
  assert.match(
    decodeURIComponent(url.pathname.slice(1)),
    /^suite_test_[a-z0-9_]+$/,
    'Refusing a database without the dedicated suite_test_ prefix.',
  );
  assert.ok(!url.searchParams.has('options'), 'Connection startup options are not supported.');
  return url;
}

const adminUrl = testUrl('SUITE_TEST_DATABASE_URL');
const runtimeUrl = testUrl('SUITE_TEST_RUNTIME_DATABASE_URL');
assert.equal(runtimeUrl.hostname, adminUrl.hostname, 'Both connections must use the same host.');
assert.equal(runtimeUrl.port || '5432', adminUrl.port || '5432', 'Use the same PostgreSQL port.');
assert.equal(runtimeUrl.pathname, adminUrl.pathname, 'Both connections must use the same DB.');
assert.notEqual(runtimeUrl.username, adminUrl.username, 'Runtime must use a different login.');

const admin = new PostgresDatabase(adminUrl.href);
const runtime = new PostgresDatabase(runtimeUrl.href);
// Random per invocation, unrelated to any deployed Auth credential/provider.
const auth = {
  issuer: 'https://suite-postgres-test.invalid/auth',
  audience: 'suite-postgres-test',
  secret: randomBytes(48).toString('base64url'),
};
const app = buildApp({ database: runtime, mode: 'real', auth });
let phase = 'database safety checks';
let passed = 0;

function done(label: string): void {
  passed += 1;
  console.log(`PASS ${label}`);
}
function quotedIdentifier(value: string): string {
  return '"' + value.replaceAll('"', '""') + '"';
}
function expectStatus(
  response: { statusCode: number; json(): any },
  status: number,
  code?: string,
): void {
  assert.equal(response.statusCode, status, `Expected HTTP ${status} during ${phase}.`);
  if (code) assert.equal(response.json().error.code, code);
}
async function token(actorId: string, secret = auth.secret): Promise<string> {
  return new SignJWT({ role: 'service_role', app_metadata: { role: 'manager' } })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(actorId)
    .setIssuer(auth.issuer)
    .setAudience(auth.audience)
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret));
}
const tokens = new Map<string, string>();
function headers(actorId: string = ids.worker, businessId: string = ids.business) {
  return {
    authorization: 'Bearer ' + tokens.get(actorId),
    'x-business-id': businessId,
    // These must not confer manager rights in real mode.
    'x-demo-user': 'manager',
    'x-role': 'manager',
  };
}
async function post(
  url: string,
  payload: Record<string, unknown>,
  actorId: string = ids.worker,
  key = randomUUID(),
  businessId: string = ids.business,
) {
  return app.inject({
    method: 'POST',
    url,
    headers: { ...headers(actorId, businessId), 'idempotency-key': key },
    payload,
  });
}
const expenseBody = {
  jobId: ids.assignedJob,
  description: 'Invented concurrency-test fuel expense',
  amountMinor: 15550,
  currency: 'MXN',
  missingReceiptReason: 'Test fixture: no actual purchase or receipt.',
};
const jobBody = {
  title: 'Invented PostgreSQL test visit',
  customerName: 'Fictional test customer',
  agreedPriceMinor: 45000,
  currency: 'MXN',
  assignedUserIds: [ids.worker],
};
async function count(sql: string, values: unknown[] = []): Promise<number> {
  const result = await admin.query<{ count: string }>(sql, values);
  return Number(result.rows[0]!.count);
}
async function expectSqlDenied(sql: string): Promise<void> {
  await assert.rejects(
    runtime.transaction(async (tx) => {
      await tx.query("SELECT set_config('suite.business_id',$1,true)", [ids.business]);
      await tx.exec(sql);
    }),
    (error: unknown) => (error as { code?: string }).code === '42501',
    'Runtime operation must fail with PostgreSQL insufficient_privilege.',
  );
}

try {
  const actual = await admin.query<{ database: string; version: string; current_user: string }>(
    'SELECT current_database() AS database, version(), current_user',
  );
  assert.equal(actual.rows[0]!.database, decodeURIComponent(adminUrl.pathname.slice(1)));
  assert.match(actual.rows[0]!.version, /^PostgreSQL /, 'This suite requires real PostgreSQL.');
  const runtimeIdentity = await runtime.query<{
    database: string;
    current_user: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
  }>(
    'SELECT current_database() AS database, current_user, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole ' +
      'FROM pg_roles WHERE rolname=current_user',
  );
  const role = runtimeIdentity.rows[0]!;
  assert.equal(role.database, actual.rows[0]!.database);
  assert.notEqual(role.current_user, actual.rows[0]!.current_user);
  for (const flag of ['rolsuper', 'rolbypassrls', 'rolcreatedb', 'rolcreaterole'] as const)
    assert.equal(role[flag], false, `Runtime ${flag} must be false.`);
  assert.equal(
    await count(
      "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')",
    ),
    0,
    'Refusing a nonempty test database. Provision a fresh disposable DB for each run.',
  );
  assert.equal(
    await count(
      "SELECT count(*) FROM pg_database WHERE datname=current_database() AND pg_has_role($1,datdba,'MEMBER')",
      [role.current_user],
    ),
    0,
    'Runtime cannot be or inherit the database owner.',
  );
  done('dedicated empty real PostgreSQL database and restricted login');

  phase = 'migrations';
  await migrate(admin);
  const before = await admin.query(
    'SELECT name,checksum,applied_at FROM suite_schema_migrations ORDER BY name',
  );
  assert.ok(before.rows.length > 0);
  await migrate(admin);
  assert.deepEqual(
    (
      await admin.query(
        'SELECT name,checksum,applied_at FROM suite_schema_migrations ORDER BY name',
      )
    ).rows,
    before.rows,
    'Second migration run must not reapply migrations.',
  );
  const migration = before.rows[0] as { name: string; checksum: string };
  await admin.query('UPDATE suite_schema_migrations SET checksum=$2 WHERE name=$1', [
    migration.name,
    'deliberately-invalid-test-checksum',
  ]);
  try {
    await assert.rejects(migrate(admin), /Applied migration was modified/);
  } finally {
    await admin.query('UPDATE suite_schema_migrations SET checksum=$2 WHERE name=$1', [
      migration.name,
      migration.checksum,
    ]);
  }
  const runtimeRole = quotedIdentifier(role.current_user);
  // Privileges affect this empty test database only, never cluster role flags.
  await admin.exec(`
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO ${runtimeRole};
    GRANT SELECT ON suite_schema_migrations,suite_users,businesses,memberships,membership_grants,business_modules TO ${runtimeRole};
    GRANT SELECT,INSERT,UPDATE ON jobs,expenses,command_receipts TO ${runtimeRole};
    GRANT SELECT,INSERT ON job_assignments TO ${runtimeRole};
    GRANT INSERT ON audit_events TO ${runtimeRole};
  `);
  await seedDemo(admin);
  for (const actor of [ids.manager, ids.worker, ids.otherWorker, ids.outsider])
    tokens.set(actor, await token(actor));
  done('schema migration, repeat stability and changed-checksum rejection');

  phase = 'authentication and authorization';
  const anonymous = await app.inject({
    url: '/v1/workspace',
    headers: { 'x-demo-user': 'manager', 'x-business-id': ids.business },
  });
  expectStatus(anonymous, 401, 'UNAUTHENTICATED');
  const wrongToken = await app.inject({
    url: '/v1/workspace',
    headers: {
      ...headers(),
      authorization: 'Bearer ' + (await token(ids.worker, randomBytes(48).toString('base64url'))),
    },
  });
  expectStatus(wrongToken, 401, 'UNAUTHENTICATED');
  const workspace = await app.inject({ url: '/v1/workspace', headers: headers() });
  expectStatus(workspace, 200);
  assert.equal(workspace.json().demo, false);
  assert.equal(workspace.json().user.id, ids.worker);
  assert.equal(workspace.json().members, undefined);
  expectStatus(await post('/v1/jobs', jobBody), 403, 'ACTION_DENIED');
  expectStatus(
    await post(`/v1/expenses/${ids.workerExpense}/review`, { version: 1, decision: 'approve' }),
    403,
    'ACTION_DENIED',
  );
  expectStatus(
    await app.inject({ url: '/v1/workspace', headers: headers(ids.worker, ids.otherBusiness) }),
    403,
    'BUSINESS_ACCESS_DENIED',
  );
  done('real JWT authentication, role-claim/header rejection and membership/action enforcement');

  phase = 'concurrent expense idempotency';
  const expenseKey = randomUUID();
  const expenses = await Promise.all(
    Array.from({ length: 16 }, () => post('/v1/expenses', expenseBody, ids.worker, expenseKey)),
  );
  for (const response of expenses) {
    expectStatus(response, 201);
    assert.deepEqual(response.json(), expenses[0]!.json());
  }
  const expenseId = expenses[0]!.json().expense.id as string;
  assert.equal(await count('SELECT count(*) FROM expenses WHERE id=$1', [expenseId]), 1);
  assert.equal(
    await count(
      "SELECT count(*) FROM audit_events WHERE record_id=$1 AND action='expense.submitted'",
      [expenseId],
    ),
    1,
  );
  assert.equal(
    await count('SELECT count(*) FROM command_receipts WHERE key=$1 AND response IS NOT NULL', [
      expenseKey,
    ]),
    1,
  );
  expectStatus(
    await post('/v1/expenses', { ...expenseBody, amountMinor: 15551 }, ids.worker, expenseKey),
    409,
    'IDEMPOTENCY_CONFLICT',
  );
  const collisionKey = randomUUID();
  const collision = await Promise.all([
    post('/v1/expenses', { ...expenseBody, amountMinor: 20001 }, ids.worker, collisionKey),
    post('/v1/expenses', { ...expenseBody, amountMinor: 20002 }, ids.worker, collisionKey),
  ]);
  assert.deepEqual(collision.map((item) => item.statusCode).sort(), [201, 409]);
  assert.equal(
    collision.find((item) => item.statusCode === 409)!.json().error.code,
    'IDEMPOTENCY_CONFLICT',
  );
  done(
    '16 concurrent expense retries create one expense, receipt and audit; conflicting input rejected',
  );

  phase = 'concurrent close retries';
  const created = await post('/v1/jobs', jobBody, ids.manager);
  expectStatus(created, 201);
  const jobId = created.json().job.id as string;
  const closeKey = randomUUID();
  const closes = await Promise.all(
    Array.from({ length: 16 }, () =>
      post(`/v1/jobs/${jobId}/close`, { version: 1 }, ids.worker, closeKey),
    ),
  );
  for (const response of closes) {
    expectStatus(response, 200);
    assert.deepEqual(response.json(), closes[0]!.json());
  }
  assert.equal(closes[0]!.json().job.status, 'completed');
  assert.equal(closes[0]!.json().job.version, 2);
  assert.equal(closes[0]!.json().job.agreedPriceMinor, undefined);
  assert.equal(
    await count("SELECT count(*) FROM audit_events WHERE record_id=$1 AND action='job.closed'", [
      jobId,
    ]),
    1,
  );
  assert.equal(
    await count('SELECT count(*) FROM command_receipts WHERE key=$1 AND response IS NOT NULL', [
      closeKey,
    ]),
    1,
  );
  done('16 concurrent same-key close retries complete once without leaking price');

  phase = 'job version race';
  const raceCreated = await post(
    '/v1/jobs',
    { ...jobBody, title: 'Invented version-race visit' },
    ids.manager,
  );
  expectStatus(raceCreated, 201);
  const raceJobId = raceCreated.json().job.id as string;
  const raceKeys = [randomUUID(), randomUUID()];
  const race = await Promise.all(
    raceKeys.map((key) => post(`/v1/jobs/${raceJobId}/close`, { version: 1 }, ids.worker, key)),
  );
  assert.deepEqual(race.map((item) => item.statusCode).sort(), [200, 409]);
  assert.equal(race.find((item) => item.statusCode === 409)!.json().error.code, 'VERSION_CONFLICT');
  assert.equal(
    await count("SELECT count(*) FROM audit_events WHERE record_id=$1 AND action='job.closed'", [
      raceJobId,
    ]),
    1,
  );
  assert.equal(
    await count('SELECT count(*) FROM command_receipts WHERE key=ANY($1::text[])', [raceKeys]),
    1,
    'Failed competing command must roll back its receipt.',
  );
  done(
    'different-key close race has one winner and one visible version conflict; losing receipt rolls back',
  );

  phase = 'business and record isolation';
  const workerJobs = await app.inject({ url: '/v1/jobs', headers: headers() });
  expectStatus(workerJobs, 200);
  assert.ok(
    workerJobs
      .json()
      .jobs.every(
        (job: { assignedUserIds: string[]; agreedPriceMinor?: number }) =>
          job.assignedUserIds.includes(ids.worker) && job.agreedPriceMinor === undefined,
      ),
  );
  expectStatus(await post(`/v1/jobs/${ids.unassignedJob}/close`, { version: 1 }), 404, 'NOT_FOUND');
  expectStatus(
    await post(`/v1/jobs/${ids.otherBusinessJob}/close`, { version: 1 }, ids.manager),
    404,
    'NOT_FOUND',
  );
  expectStatus(
    await post('/v1/expenses', { ...expenseBody, jobId: ids.otherBusinessJob }),
    404,
    'NOT_FOUND',
  );
  const workerExpenses = await app.inject({ url: '/v1/expenses', headers: headers() });
  expectStatus(workerExpenses, 200);
  assert.ok(
    workerExpenses
      .json()
      .expenses.every((expense: { payerUserId: string }) => expense.payerUserId === ids.worker),
  );
  await runtime.transaction(async (tx) => {
    await tx.query("SELECT set_config('suite.business_id',$1,true)", [ids.business]);
    assert.equal(
      (await tx.query('SELECT id FROM jobs WHERE business_id=$1', [ids.otherBusiness])).rows.length,
      0,
    );
    assert.equal(
      (await tx.query('SELECT id FROM expenses WHERE business_id=$1', [ids.otherBusiness])).rows
        .length,
      0,
    );
  });
  // Across more requests than the pool size, no previous SET LOCAL may survive.
  const outsideContext = await Promise.all(
    Array.from({ length: 16 }, () => runtime.query('SELECT id FROM jobs')),
  );
  for (const rows of outsideContext) assert.equal(rows.rows.length, 0);
  const mixedBusinesses = await Promise.all(
    Array.from({ length: 16 }, (_, i) =>
      app.inject({
        url: '/v1/jobs',
        headers: i % 2 ? headers(ids.outsider, ids.otherBusiness) : headers(ids.manager),
      }),
    ),
  );
  for (const [index, response] of mixedBusinesses.entries()) {
    expectStatus(response, 200);
    const jobIds = response.json().jobs.map((job: { id: string }) => job.id);
    if (index % 2) assert.deepEqual(jobIds, [ids.otherBusinessJob]);
    else assert.ok(!jobIds.includes(ids.otherBusinessJob));
  }
  done('assigned/own scope, cross-business API/RLS isolation and pooled transaction-context reset');

  phase = 'restricted database privileges';
  for (const sql of [
    'UPDATE memberships SET active=false',
    'UPDATE membership_grants SET active=false',
    'UPDATE business_modules SET enabled=false',
    "UPDATE suite_users SET name='Changed'",
    'DELETE FROM audit_events',
    "UPDATE audit_events SET action='changed'",
    'CREATE TABLE public.runtime_must_not_create(id integer)',
    'ALTER TABLE jobs DISABLE ROW LEVEL SECURITY',
  ])
    await expectSqlDenied(sql);
  await assert.rejects(
    runtime.transaction(async (tx) => {
      await tx.query("SELECT set_config('suite.business_id',$1,true)", [ids.business]);
      await tx.query(
        'INSERT INTO expenses(id,business_id,description,amount_minor,payer_user_id,missing_receipt_reason) VALUES ($1,$2,$3,$4,$5,$6)',
        [
          randomUUID(),
          ids.otherBusiness,
          'Forbidden cross-business row',
          100,
          ids.outsider,
          'Test only',
        ],
      );
    }),
    (error: unknown) => (error as { code?: string }).code === '42501',
  );
  assert.equal(await count('SELECT count(*) FROM memberships WHERE NOT active'), 0);
  done('runtime cannot modify grants, identities, audit history, schema or another business');

  phase = 'expense review race and authority';
  const reviewKeys = [randomUUID(), randomUUID()];
  const reviews = await Promise.all(
    reviewKeys.map((key) =>
      post(
        `/v1/expenses/${expenseId}/review`,
        { version: 1, decision: 'approve' },
        ids.manager,
        key,
      ),
    ),
  );
  assert.deepEqual(reviews.map((item) => item.statusCode).sort(), [200, 409]);
  assert.equal(
    reviews.find((item) => item.statusCode === 409)!.json().error.code,
    'VERSION_CONFLICT',
  );
  const approved = reviews.find((item) => item.statusCode === 200)!.json().expense;
  assert.equal(approved.status, 'approved');
  assert.equal(approved.version, 2);
  assert.equal(
    await count(
      "SELECT count(*) FROM audit_events WHERE record_id=$1 AND action='expense.approved'",
      [expenseId],
    ),
    1,
  );
  const managerExpense = await post('/v1/expenses', { ...expenseBody, jobId: null }, ids.manager);
  expectStatus(managerExpense, 201);
  expectStatus(
    await post(
      `/v1/expenses/${managerExpense.json().expense.id}/review`,
      { version: 1, decision: 'approve' },
      ids.manager,
    ),
    403,
    'SELF_APPROVAL_DENIED',
  );
  await admin.query(
    "UPDATE business_modules SET enabled=false WHERE business_id=$1 AND module='money'",
    [ids.business],
  );
  expectStatus(await post('/v1/expenses', expenseBody), 403, 'MODULE_DISABLED');
  await admin.query('UPDATE memberships SET active=false WHERE business_id=$1 AND user_id=$2', [
    ids.business,
    ids.worker,
  ]);
  expectStatus(
    await app.inject({ url: '/v1/workspace', headers: headers() }),
    403,
    'BUSINESS_ACCESS_DENIED',
  );
  done('expense review race, self-approval denial and immediate module/membership revocation');
  console.log(
    `Real PostgreSQL verification complete: ${passed} groups passed. Dispose of the dedicated test database and test login.`,
  );
} catch (error) {
  // Connection/auth errors can contain environment details. Print a safe phase
  // and error category, never a connection URL, token, raw query or full stack.
  console.error(
    `FAIL during ${phase}. ${error instanceof assert.AssertionError ? error.message : 'Database or API verification failed; inspect the disposable test environment.'}`,
  );
  process.exitCode = 1;
} finally {
  await app.close();
  await runtime.close();
  await admin.close();
}
