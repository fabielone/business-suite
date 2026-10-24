import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { DemoDatabase, migrate, type Database } from '../src/database.js';
import { DEMO_IDS as ids, seedDemo } from '../src/demo-fixtures.js';
import { buildApp } from '../src/app.js';
import { authConfig, createJwtVerifier } from '../src/auth.js';

describe('Work/Money command API with ephemeral PostgreSQL (PGlite)', () => {
  let db: DemoDatabase;
  let app: ReturnType<typeof buildApp>;
  const managerHeaders = { host: '127.0.0.1:4310', 'x-demo-user': 'manager' };
  const workerHeaders = { host: '127.0.0.1:4310', 'x-demo-user': 'worker' };
  const jobBody = {
    title: 'Test installation',
    customerName: 'Invented customer',
    agreedPriceMinor: 105050,
    currency: 'MXN',
    assignedUserIds: [ids.worker],
  };
  const expenseBody = {
    jobId: ids.assignedJob,
    description: 'Test hardware',
    amountMinor: 7250,
    currency: 'MXN',
    missingReceiptReason: 'Vendor could not provide a receipt.',
  };
  function post(url: string, payload: unknown, actor = 'manager', key = randomUUID()) {
    return app.inject({
      method: 'POST',
      url,
      headers: {
        host: '127.0.0.1:4310',
        'x-demo-user': actor,
        'idempotency-key': key,
      },
      payload,
    });
  }
  beforeEach(async () => {
    db = new DemoDatabase();
    await migrate(db);
    await seedDemo(db);
    app = buildApp({ database: db, mode: 'demo' });
  });
  afterEach(async () => {
    await app.close();
    await db.close();
  });

  test('workspace permissions, assignment scope, roster and price redaction come from server data', async () => {
    const manager = await app.inject({ url: '/v1/workspace', headers: managerHeaders });
    assert.equal(manager.statusCode, 200);
    assert.equal(manager.json().demo, true);
    assert.equal(manager.json().business.id, ids.business);
    assert.equal(manager.json().members.length, 3);
    const worker = await app.inject({ url: '/v1/workspace', headers: workerHeaders });
    assert.equal(worker.json().user.id, ids.worker);
    assert.equal(worker.json().members, undefined);
    assert.equal(worker.json().permissions.includes('money.expenses.review'), false);
    const jobs = await app.inject({ url: '/v1/jobs', headers: workerHeaders });
    assert.equal(jobs.statusCode, 200);
    assert.deepEqual(
      jobs.json().jobs.map((job: { id: string }) => job.id),
      [ids.assignedJob],
    );
    assert.equal(Object.hasOwn(jobs.json().jobs[0], 'agreedPriceMinor'), false);
    const allJobs = await app.inject({ url: '/v1/jobs', headers: managerHeaders });
    assert.equal(allJobs.json().jobs.length, 2);
    assert.equal(
      allJobs.json().jobs.find((job: { id: string }) => job.id === ids.assignedJob)
        .agreedPriceMinor,
      125000,
    );
    const expenses = await app.inject({ url: '/v1/expenses', headers: workerHeaders });
    assert.deepEqual(
      expenses.json().expenses.map((item: { id: string }) => item.id),
      [ids.workerExpense],
    );
  });

  test('foreign business IDs, unassigned jobs and linked expenses never escape record scope', async () => {
    assert.equal(
      (
        await app.inject({
          url: '/v1/jobs',
          headers: { ...managerHeaders, 'x-business-id': ids.otherBusiness },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await post('/v1/jobs/' + ids.otherBusinessJob + '/close', { version: 1 })).statusCode,
      404,
    );
    assert.equal(
      (await post('/v1/jobs/' + ids.unassignedJob + '/close', { version: 1 }, 'worker')).statusCode,
      404,
    );
    assert.equal(
      (await post('/v1/expenses', { ...expenseBody, jobId: ids.unassignedJob }, 'worker'))
        .statusCode,
      404,
    );
    assert.equal(
      (await post('/v1/expenses', { ...expenseBody, jobId: ids.otherBusinessJob }, 'worker'))
        .statusCode,
      404,
    );
    assert.equal(
      (
        await post('/v1/expenses/' + ids.otherBusinessExpense + '/review', {
          version: 1,
          decision: 'approve',
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (await post('/v1/jobs', { ...jobBody, assignedUserIds: [ids.outsider] })).statusCode,
      400,
    );
    assert.equal(
      (await post('/v1/expenses', { ...expenseBody, payerUserId: ids.manager }, 'worker'))
        .statusCode,
      400,
    );
    assert.equal((await post('/v1/jobs', jobBody, 'worker')).statusCode, 403);
  });

  test('active memberships, enabled modules, individual actions and review scope are checked afresh', async () => {
    await db.query('UPDATE memberships SET active=false WHERE business_id=$1 AND user_id=$2', [
      ids.business,
      ids.worker,
    ]);
    assert.equal(
      (await app.inject({ url: '/v1/workspace', headers: workerHeaders })).statusCode,
      403,
    );
    await db.query('UPDATE memberships SET active=true WHERE business_id=$1 AND user_id=$2', [
      ids.business,
      ids.worker,
    ]);
    await db.query(
      "UPDATE business_modules SET enabled=false WHERE business_id=$1 AND module='work'",
      [ids.business],
    );
    assert.equal(
      (await app.inject({ url: '/v1/jobs', headers: workerHeaders })).json().error.code,
      'MODULE_DISABLED',
    );
    await db.query(
      "UPDATE business_modules SET enabled=true WHERE business_id=$1 AND module='work'",
      [ids.business],
    );
    await db.query(
      "UPDATE membership_grants SET active=false WHERE business_id=$1 AND user_id=$2 AND permission='work.jobs.close'",
      [ids.business, ids.worker],
    );
    assert.equal(
      (await post('/v1/jobs/' + ids.assignedJob + '/close', { version: 1 }, 'worker')).statusCode,
      403,
    );
    await db.query(
      "UPDATE membership_grants SET scope='own' WHERE business_id=$1 AND user_id=$2 AND permission='money.expenses.review'",
      [ids.business, ids.manager],
    );
    assert.equal(
      (
        await post('/v1/expenses/' + ids.workerExpense + '/review', {
          version: 1,
          decision: 'approve',
        })
      ).statusCode,
      403,
    );
  });

  test('authorized workers close jobs directly; version checks, retry replay and price redaction survive writes', async () => {
    const key = randomUUID();
    const closed = await post(
      '/v1/jobs/' + ids.assignedJob + '/close',
      { version: 1 },
      'worker',
      key,
    );
    assert.equal(closed.statusCode, 200);
    assert.equal(closed.json().job.status, 'completed');
    assert.equal(closed.json().job.version, 2);
    assert.equal(closed.json().job.agreedPriceMinor, undefined);
    const repeated = await post(
      '/v1/jobs/' + ids.assignedJob + '/close',
      { version: 1 },
      'worker',
      key,
    );
    assert.deepEqual(repeated.json(), closed.json());
    assert.equal(
      (await post('/v1/jobs/' + ids.assignedJob + '/close', { version: 2 }, 'worker', key)).json()
        .error.code,
      'IDEMPOTENCY_CONFLICT',
    );
    assert.equal(
      (await post('/v1/jobs/' + ids.assignedJob + '/close', { version: 1 }, 'worker')).json().error
        .code,
      'VERSION_CONFLICT',
    );
    assert.equal(
      (await post('/v1/jobs/' + ids.assignedJob + '/close', { version: 2 }, 'worker')).json().error
        .code,
      'INVALID_TRANSITION',
    );
    const audit = await db.query<{ actor_id: string }>(
      "SELECT actor_id FROM audit_events WHERE action='job.closed'",
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0]?.actor_id, ids.worker);
    await db.query(
      'DELETE FROM job_assignments WHERE business_id=$1 AND job_id=$2 AND user_id=$3',
      [ids.business, ids.assignedJob, ids.worker],
    );
    assert.equal(
      (await post('/v1/jobs/' + ids.assignedJob + '/close', { version: 1 }, 'worker', key))
        .statusCode,
      404,
    );
  });

  test('job creation rejects unsafe money; idempotent duplicate requests create exactly one local job and audit', async () => {
    for (const price of [-1, 0.1, 1_000_000_000_001, '100']) {
      assert.equal(
        (await post('/v1/jobs', { ...jobBody, agreedPriceMinor: price })).statusCode,
        400,
      );
    }
    const key = randomUUID();
    const results = await Promise.all([
      post('/v1/jobs', jobBody, 'manager', key),
      post('/v1/jobs', jobBody, 'manager', key),
    ]);
    assert.deepEqual(
      results.map((result) => result.statusCode),
      [201, 201],
    );
    assert.equal(results[0]!.json().job.id, results[1]!.json().job.id);
    assert.equal(results[0]!.json().job.agreedPriceMinor, jobBody.agreedPriceMinor);
    assert.equal(
      (await post('/v1/jobs', { ...jobBody, title: 'Changed' }, 'manager', key)).statusCode,
      409,
    );
    assert.equal(
      (await db.query("SELECT id FROM audit_events WHERE action='job.created'")).rows.length,
      1,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/jobs',
          headers: managerHeaders,
          payload: jobBody,
        })
      ).statusCode,
      400,
    );
  });

  test('receiptless submissions always require reason/review, authenticated payer and independent approval', async () => {
    for (const reason of ['', '   ', undefined]) {
      assert.equal(
        (await post('/v1/expenses', { ...expenseBody, missingReceiptReason: reason }, 'worker'))
          .statusCode,
        400,
      );
    }
    assert.equal(
      (await post('/v1/expenses', { ...expenseBody, amountMinor: 0 }, 'worker')).statusCode,
      400,
    );
    const key = randomUUID();
    const submitted = await post('/v1/expenses', expenseBody, 'worker', key);
    assert.equal(submitted.statusCode, 201);
    assert.equal(submitted.json().expense.status, 'submitted');
    assert.equal(submitted.json().expense.payerUserId, ids.worker);
    assert.equal(submitted.json().expense.amountMinor, 7250);
    const id = submitted.json().expense.id;
    assert.deepEqual(
      (await post('/v1/expenses', expenseBody, 'worker', key)).json(),
      submitted.json(),
    );
    assert.equal(
      (await post('/v1/expenses/' + id + '/review', { version: 1, decision: 'approve' }, 'worker'))
        .statusCode,
      403,
    );
    const reviewKey = randomUUID();
    const approved = await post(
      '/v1/expenses/' + id + '/review',
      { version: 1, decision: 'approve' },
      'manager',
      reviewKey,
    );
    assert.equal(approved.statusCode, 200);
    assert.equal(approved.json().expense.status, 'approved');
    assert.equal(approved.json().expense.version, 2);
    assert.equal(approved.json().expense.paid, undefined);
    assert.deepEqual(
      (
        await post(
          '/v1/expenses/' + id + '/review',
          { version: 1, decision: 'approve' },
          'manager',
          reviewKey,
        )
      ).json(),
      approved.json(),
    );
    assert.equal(
      (await post('/v1/expenses/' + id + '/review', { version: 1, decision: 'reject' })).json()
        .error.code,
      'VERSION_CONFLICT',
    );
    const own = await post('/v1/expenses', { ...expenseBody, jobId: undefined }, 'manager');
    assert.equal(own.json().expense.status, 'submitted');
    assert.equal(
      (
        await post('/v1/expenses/' + own.json().expense.id + '/review', {
          version: 1,
          decision: 'approve',
        })
      ).json().error.code,
      'SELF_APPROVAL_DENIED',
    );
    const rejected = await post('/v1/expenses/' + ids.otherWorkerExpense + '/review', {
      version: 1,
      decision: 'reject',
      reason: 'Needs clarification.',
    });
    assert.equal(rejected.json().expense.status, 'rejected');
    assert.equal(rejected.json().expense.reviewReason, 'Needs clarification.');
    const price = await db.query<{ agreed_price_minor: string | number }>(
      'SELECT agreed_price_minor FROM jobs WHERE id=$1',
      [ids.assignedJob],
    );
    assert.equal(Number(price.rows[0]?.agreed_price_minor), 125000);
  });

  test('failure while appending audit rolls back business change and receipt, allowing a safe retry', async () => {
    await db.exec(
      "CREATE FUNCTION fail_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test rollback'; END; $$; CREATE TRIGGER test_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_test_audit()",
    );
    const key = randomUUID();
    const failed = await post('/v1/jobs', jobBody, 'manager', key);
    assert.equal(failed.statusCode, 500);
    assert.equal(
      (await db.query('SELECT id FROM jobs WHERE title=$1', [jobBody.title])).rows.length,
      0,
    );
    assert.equal(
      (await db.query('SELECT key FROM command_receipts WHERE key=$1', [key])).rows.length,
      0,
    );
    await db.exec(
      'DROP TRIGGER test_audit_failure ON audit_events; DROP FUNCTION fail_test_audit()',
    );
    assert.equal((await post('/v1/jobs', jobBody, 'manager', key)).statusCode, 201);
    await assert.rejects(db.exec("UPDATE audit_events SET action='tampered'"), /append-only/);
  });

  test('non-owner PostgreSQL role enforces tenant RLS, and pooled transaction context does not persist', async () => {
    await db.exec(
      'CREATE ROLE suite_test_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO suite_test_runtime; GRANT SELECT,UPDATE,INSERT ON jobs TO suite_test_runtime',
    );
    await db.transaction(async (tx) => {
      await tx.exec('SET LOCAL ROLE suite_test_runtime');
      assert.equal((await tx.query('SELECT id FROM jobs')).rows.length, 0);
      await tx.query("SELECT set_config('suite.business_id',$1,true)", [ids.business]);
      assert.equal((await tx.query('SELECT id FROM jobs')).rows.length, 2);
      assert.equal(
        (await tx.query('SELECT id FROM jobs WHERE id=$1', [ids.otherBusinessJob])).rows.length,
        0,
      );
      assert.equal(
        (
          await tx.query("UPDATE jobs SET title='Wrong business' WHERE id=$1 RETURNING id", [
            ids.otherBusinessJob,
          ])
        ).rows.length,
        0,
      );
    });
    await db.transaction(async (tx) => {
      await tx.exec('SET LOCAL ROLE suite_test_runtime');
      assert.equal((await tx.query('SELECT id FROM jobs')).rows.length, 0);
    });
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE suite_test_runtime');
        await tx.query("SELECT set_config('suite.business_id',$1,true)", [ids.business]);
        await tx.query(
          'INSERT INTO jobs(id,business_id,title,customer_name,agreed_price_minor,created_by) VALUES ($1,$2,$3,$4,$5,$6)',
          [randomUUID(), ids.otherBusiness, 'Forbidden', 'Forbidden', 100, ids.outsider],
        );
      }),
      /row-level security/,
    );
  });

  test('representative API commands work with the documented restricted runtime grants', async () => {
    await db.exec(`
      CREATE ROLE suite_api_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO suite_api_test;
      GRANT SELECT ON suite_schema_migrations,suite_users,businesses,
        memberships,membership_grants,business_modules TO suite_api_test;
      GRANT SELECT,INSERT,UPDATE ON jobs,expenses,command_receipts TO suite_api_test;
      GRANT SELECT,INSERT ON job_assignments TO suite_api_test;
      GRANT INSERT ON audit_events TO suite_api_test;
    `);
    const restricted: Database = {
      query: (sql, values) => db.query(sql, values),
      exec: (sql) => db.exec(sql),
      close: async () => {},
      transaction: (run) =>
        db.transaction(async (tx) => {
          await tx.exec('SET LOCAL ROLE suite_api_test');
          return run(tx);
        }),
    };
    const runtime = buildApp({ database: restricted, mode: 'demo' });
    const runtimePost = (
      url: string,
      payload: unknown,
      actor: 'manager' | 'worker',
      key = randomUUID(),
    ) =>
      runtime.inject({
        method: 'POST',
        url,
        payload,
        headers: {
          host: '127.0.0.1:4310',
          'x-demo-user': actor,
          'idempotency-key': key,
        },
      });
    try {
      for (const headers of [managerHeaders, workerHeaders]) {
        for (const url of ['/v1/workspace', '/v1/jobs', '/v1/expenses']) {
          const response = await runtime.inject({ url, headers });
          assert.equal(response.statusCode, 200, response.body);
        }
      }
      const createKey = randomUUID();
      const created = await runtimePost('/v1/jobs', jobBody, 'manager', createKey);
      assert.equal(created.statusCode, 201, created.body);
      assert.deepEqual(
        (await runtimePost('/v1/jobs', jobBody, 'manager', createKey)).json(),
        created.json(),
      );
      const closed = await runtimePost(
        '/v1/jobs/' + created.json().job.id + '/close',
        { version: 1 },
        'worker',
      );
      assert.equal(closed.statusCode, 200, closed.body);
      const submitted = await runtimePost('/v1/expenses', expenseBody, 'worker');
      assert.equal(submitted.statusCode, 201, submitted.body);
      const reviewed = await runtimePost(
        '/v1/expenses/' + submitted.json().expense.id + '/review',
        { version: 1, decision: 'approve' },
        'manager',
      );
      assert.equal(reviewed.statusCode, 200, reviewed.body);
      assert.equal(reviewed.json().expense.status, 'approved');
      assert.equal(
        (
          await runtimePost(
            '/v1/jobs/' + ids.otherBusinessJob + '/close',
            { version: 1 },
            'manager',
          )
        ).statusCode,
        404,
      );
      assert.equal((await db.query('SELECT id FROM audit_events')).rows.length, 4);
      for (const sql of [
        'UPDATE memberships SET active=false',
        'UPDATE membership_grants SET active=false',
        'UPDATE business_modules SET enabled=false',
        'DELETE FROM audit_events',
      ])
        await assert.rejects(
          restricted.transaction((tx) => tx.exec(sql)),
          /permission denied/,
        );
    } finally {
      await runtime.close();
    }
  });

  test('real JWT mode fails closed and ignores demo/role headers and role claims', async () => {
    assert.throws(() => authConfig({}), /Production never falls back/);
    assert.throws(
      () =>
        createJwtVerifier({
          issuer: 'https://auth.example.test',
          audience: 'authenticated',
          secret: 'short',
        }),
      /32 bytes/,
    );
    const secret = 'test-only-secret-not-a-production-credential-0123456789';
    const auth = { issuer: 'https://auth.example.test', audience: 'authenticated', secret };
    const real = buildApp({ database: db, mode: 'real', auth });
    async function token(overrides: Record<string, unknown> = {}, signingSecret = secret) {
      return new SignJWT({
        sub: ids.worker,
        iss: auth.issuer,
        aud: auth.audience,
        exp: Math.floor(Date.now() / 1000) + 600,
        role: 'service_role',
        app_metadata: { role: 'manager' },
        ...overrides,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .sign(new TextEncoder().encode(signingSecret));
    }
    const headers = {
      'x-business-id': ids.business,
      'x-demo-user': 'manager',
      'x-role': 'manager',
    };
    try {
      assert.equal((await real.inject({ url: '/v1/workspace', headers })).statusCode, 401);
      const valid = await token();
      const workspace = await real.inject({
        url: '/v1/workspace',
        headers: { ...headers, authorization: 'Bearer ' + valid },
      });
      assert.equal(workspace.statusCode, 200);
      assert.equal(workspace.json().demo, false);
      assert.equal(workspace.json().user.id, ids.worker);
      assert.equal(workspace.json().members, undefined);
      assert.equal(
        (
          await real.inject({ url: '/v1/workspace', headers: { authorization: 'Bearer ' + valid } })
        ).json().error.code,
        'BUSINESS_REQUIRED',
      );
      const denied = await real.inject({
        method: 'POST',
        url: '/v1/jobs',
        headers: {
          ...headers,
          authorization: 'Bearer ' + valid,
          'idempotency-key': randomUUID(),
        },
        payload: jobBody,
      });
      assert.equal(denied.statusCode, 403);
      for (const invalid of [
        await token({ exp: 1 }),
        await token({ iss: 'https://attacker.example' }),
        await token({ aud: 'other-service' }),
        await token({ exp: undefined }),
        await token({}, 'different-test-secret-012345678901234567890'),
      ])
        assert.equal(
          (
            await real.inject({
              url: '/v1/workspace',
              headers: { ...headers, authorization: 'Bearer ' + invalid },
            })
          ).statusCode,
          401,
        );
    } finally {
      await real.close();
    }
  });

  test('demo requires loopback/known host and rejects hostile browser origins', async () => {
    assert.equal(
      (
        await app.inject({
          url: '/v1/workspace',
          headers: { ...managerHeaders, origin: 'https://attacker.example' },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          url: '/v1/workspace',
          headers: { ...managerHeaders, host: 'attacker.example:4310' },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          url: '/v1/workspace',
          headers: managerHeaders,
          remoteAddress: '198.51.100.1',
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          url: '/v1/workspace',
          headers: { ...managerHeaders, 'x-demo-user': 'administrator' },
        })
      ).statusCode,
      401,
    );
    const good = await app.inject({
      url: '/v1/workspace',
      headers: { ...managerHeaders, origin: 'http://127.0.0.1:5178' },
    });
    assert.equal(good.statusCode, 200);
    assert.equal(good.headers['access-control-allow-origin'], 'http://127.0.0.1:5178');
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/v1/jobs',
      headers: { ...managerHeaders, origin: 'http://127.0.0.1:5178' },
    });
    assert.equal(preflight.statusCode, 204);
    const oversized = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers: managerHeaders,
      payload: { title: 'x'.repeat(65 * 1024) },
    });
    assert.equal(oversized.statusCode, 413);
    assert.equal(oversized.json().error.code, 'REQUEST_TOO_LARGE');
    const unsupported = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers: { ...managerHeaders, 'content-type': 'application/xml' },
      payload: '<job />',
    });
    assert.equal(unsupported.statusCode, 415);
    assert.equal(unsupported.json().error.code, 'UNSUPPORTED_MEDIA_TYPE');
    const unknown = await app.inject({ url: '/v1/not-a-route', headers: managerHeaders });
    assert.equal(unknown.statusCode, 404);
    assert.equal(unknown.json().error.code, 'NOT_FOUND');
  });
});
