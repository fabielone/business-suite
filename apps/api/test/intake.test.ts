import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { DemoDatabase, migrate } from '../src/database.js';
import { buildApp } from '../src/app.js';
import { emptyData, executeCommand } from '@suite/core/operations';

const auth = {
  issuer: 'https://auth.example.test',
  audience: 'authenticated',
  secret: 'test-only-secret-not-a-production-credential-0123456789',
};
const KEY = 'sik_' + 'k'.repeat(32);
const SITE = 'https://www.example.test';

describe('public lead intake with an intake key (PGlite)', () => {
  let db: DemoDatabase;
  let app: ReturnType<typeof buildApp>;
  const space = randomUUID();
  const keyId = randomUUID();
  const url = `/v2/intake/${space}/leads`;
  const contacts = async () =>
    (
      await db.query<{
        payload: { name: string; kind: string; email: string; source: string; notes: string };
      }>('SELECT payload FROM suite_contacts WHERE space_id=$1', [space])
    ).rows.map((r) => r.payload);
  beforeEach(async () => {
    db = new DemoDatabase();
    await migrate(db);
    const data = executeCommand(emptyData(), {
      id: space,
      workspaceId: space,
      type: 'workspace.create',
      payload: { name: 'Example signs', preset: 'signage' },
    });
    await db.query(
      'INSERT INTO suite_spaces(id,owner_id,config,revision) VALUES($1,$2,$3::jsonb,1)',
      [space, randomUUID(), JSON.stringify(data.workspaces[0])],
    );
    await db.query(
      'INSERT INTO suite_intake_keys(space_id,id,name,prefix,key_hash,source,origins,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        space,
        keyId,
        'Website',
        KEY.slice(0, 10),
        createHash('sha256').update(KEY).digest('hex'),
        'Website form',
        [SITE],
        randomUUID(),
      ],
    );
    app = buildApp({ database: db, mode: 'real', auth, allowedOrigins: [] });
  });
  afterEach(async () => {
    await app.close();
    await db.close();
  });

  test('JSON from a sales channel adds a customer, a company and a pipeline project once', async () => {
    const send = () =>
      app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${KEY}`, 'idempotency-key': 'zap-000123' },
        payload: {
          fields: {
            first_name: 'Ana',
            last_name: 'Ruiz',
            email: 'ana@example.com',
            company: 'Ruiz SA',
            message: 'Quote please',
            kind: 'member',
          },
          projectTitle: 'Storefront sign',
          estimatedValueMinor: 250000,
        },
      });
    const first = await send();
    assert.equal(first.statusCode, 201, first.body);
    const retry = await send();
    assert.equal(retry.statusCode, 200);
    const [ana] = await contacts();
    assert.equal((await contacts()).length, 1);
    assert.equal(ana!.name, 'Ana Ruiz');
    assert.equal(ana!.kind, 'customer');
    assert.equal(ana!.source, 'Website form');
    assert.match(ana!.notes, /Quote please/);
    const companies = await db.query('SELECT 1 FROM suite_companies WHERE space_id=$1', [space]);
    assert.equal(companies.rows.length, 1);
    const deals = await db.query<{ payload: { amountMinor: number } }>(
      'SELECT payload FROM suite_deals WHERE space_id=$1',
      [space],
    );
    assert.equal(deals.rows[0]!.payload.amountMinor, 250000);
    const audit = await db.query<{ actor_id: string }>(
      "SELECT actor_id FROM suite_space_audit WHERE space_id=$1 AND payload->>'action'='lead.capture'",
      [space],
    );
    assert.equal(audit.rows[0]!.actor_id, keyId);
  });

  test('a plain HTML form posts url-encoded fields and returns to an allowed page', async () => {
    const response = await app.inject({
      method: 'POST',
      url,
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: SITE },
      payload: `_key=${KEY}&name=Luis+Paz&email=luis%40example.com&_redirect=${encodeURIComponent(SITE + '/thanks')}`,
    });
    assert.equal(response.statusCode, 303);
    assert.equal(response.headers.location, SITE + '/thanks');
    assert.equal(response.headers['access-control-allow-origin'], SITE);
    assert.equal((await contacts())[0]!.email, 'luis@example.com');
    const elsewhere = await app.inject({
      method: 'POST',
      url,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `_key=${KEY}&name=Mia&_redirect=${encodeURIComponent('https://evil.example/x')}`,
    });
    assert.equal(elsewhere.statusCode, 201, 'never redirects to a site the key does not allow');
  });

  test('wrong keys, other websites, revoked keys and bots store nothing', async () => {
    const post = (
      headers: Record<string, string>,
      payload: Record<string, unknown> = { name: 'X' },
    ) => app.inject({ method: 'POST', url, headers, payload });
    assert.equal((await post({})).statusCode, 401);
    assert.equal((await post({ 'x-intake-key': 'sik_' + 'z'.repeat(32) })).statusCode, 401);
    assert.equal(
      (await post({ 'x-intake-key': KEY, origin: 'https://other.example' })).statusCode,
      403,
    );
    assert.equal(
      (await post({ 'x-intake-key': KEY }, { name: 'Bot', _gotcha: 'filled' })).statusCode,
      202,
    );
    assert.equal((await post({ 'x-intake-key': KEY }, { email: 'bad' })).statusCode, 400);
    await db.query('UPDATE suite_intake_keys SET revoked_at=now()');
    assert.equal((await post({ 'x-intake-key': KEY })).statusCode, 401);
    assert.equal((await contacts()).length, 0);
    const other = await app.inject({
      method: 'POST',
      url: `/v2/intake/${randomUUID()}/leads`,
      headers: { 'x-intake-key': KEY },
      payload: { name: 'X' },
    });
    assert.equal(other.statusCode, 401, 'a key only works for its own workspace');
  });

  test('member command routes still refuse url-encoded bodies and unknown origins', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/v2/workspaces/${space}/commands`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'type=contact.save',
    });
    assert.equal(response.statusCode, 415);
    const foreign = await app.inject({
      method: 'GET',
      url: `/v2/workspaces/${space}`,
      headers: { origin: SITE },
    });
    assert.equal(foreign.statusCode, 403);
  });
});
