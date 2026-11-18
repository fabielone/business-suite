import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT } from 'jose';
import { DemoDatabase, migrate } from '../src/database.js';
import { buildApp } from '../src/app.js';
import { emptyData, executeCommand } from '@suite/core/operations';

const auth = {
  issuer: 'https://auth.example.test',
  audience: 'authenticated',
  secret: 'test-only-secret-not-a-production-credential-0123456789',
};
const APP_ORIGIN = 'https://suite.example.test';
const token = (id: string, email: string) =>
  new SignJWT({ email, user_metadata: { name: email.split('@')[0] } })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(auth.issuer)
    .setAudience(auth.audience)
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(auth.secret));
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe('operations API security (PGlite, stand-in sign-in service)', () => {
  let db: DemoDatabase;
  let app: ReturnType<typeof buildApp>;
  let upstream: Server;
  const space = randomUUID();
  const owner = { id: randomUUID(), email: 'owner@example.com' };
  const sales = { id: randomUUID(), email: 'sales@example.com' };
  const viewer = { id: randomUUID(), email: 'viewer@example.com' };
  const bearer = async (user: { id: string; email: string }) => ({
    authorization: `Bearer ${await token(user.id, user.email)}`,
  });
  const command = async (
    user: { id: string; email: string },
    type: string,
    payload: Record<string, unknown>,
  ) =>
    app.inject({
      method: 'POST',
      url: `/v2/workspaces/${space}/commands`,
      headers: await bearer(user),
      payload: { id: randomUUID(), workspaceId: space, type, payload },
    });

  before(async () => {
    // Answers password sign-in the way the real service does, for owner@example.com only.
    upstream = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', async () => {
        const sent = JSON.parse(body || '{}') as { email?: string; password?: string };
        response.setHeader('content-type', 'application/json');
        if (request.url?.startsWith('/token') && sent.email === owner.email && sent.password) {
          response.end(
            JSON.stringify({
              access_token: await token(owner.id, owner.email),
              refresh_token: 'stand-in-refresh',
              expires_in: 600,
            }),
          );
        } else {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: 'invalid_grant' }));
        }
      });
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    process.env.SUITE_AUTH_INTERNAL_URL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  });
  after(async () => {
    delete process.env.SUITE_AUTH_INTERNAL_URL;
    await new Promise((resolve) => upstream.close(resolve));
  });
  const start = (options: { trustedProxies?: string[]; cookiePath?: string } = {}) =>
    buildApp({ database: db, mode: 'real', auth, allowedOrigins: [APP_ORIGIN], ...options });
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
      [space, owner.id, JSON.stringify(data.workspaces[0])],
    );
    for (const [user, role] of [
      [owner, 'owner'],
      [sales, 'collaborator'],
      [viewer, 'viewer'],
    ] as const)
      await db.query(
        'INSERT INTO suite_space_members(space_id,user_id,email,name,role) VALUES($1,$2,$3,$4,$5)',
        [space, user.id, user.email, user.email, role],
      );
    app = start();
  });
  afterEach(async () => {
    await app.close();
    await db.close();
  });

  test('a contact editor cannot take over a team member through the API', async () => {
    const member = {
      name: 'Alex',
      kind: 'member',
      email: 'alex@example.com',
      phone: '',
      url: '',
      notes: '',
      company: '',
    };
    const created = await command(owner, 'contact.save', member);
    assert.equal(created.statusCode, 200, created.body);
    const alex = (
      await db.query<{ id: string }>('SELECT id FROM suite_contacts WHERE space_id=$1', [space])
    ).rows[0]!;
    const hijack = await command(sales, 'contact.save', {
      ...member,
      id: alex.id,
      email: sales.email,
    });
    assert.equal(hijack.statusCode, 403, hijack.body);
    assert.match(hijack.body, /owner or manager/);
    const stored = await db.query<{ payload: { email: string } }>(
      'SELECT payload FROM suite_contacts WHERE space_id=$1',
      [space],
    );
    assert.equal(stored.rows[0]!.payload.email, 'alex@example.com');
    const clock = await command(sales, 'time.clockIn', { memberId: alex.id });
    assert.equal(clock.statusCode, 403, clock.body);
  });

  test('imports are refused for roles that cannot create the records', async () => {
    const rows = [
      {
        title: 'Sign',
        amountMinor: 100,
        stage: '',
        due: '',
        notes: '',
        customerName: '',
        customerEmail: '',
        customerPhone: '',
        company: '',
      },
    ];
    for (const type of ['deal.import', 'project.import']) {
      const denied = await command(viewer, type, { rows });
      assert.equal(denied.statusCode, 403, `${type}: ${denied.body}`);
    }
    const allowed = await command(sales, 'deal.import', { rows });
    assert.equal(allowed.statusCode, 200, allowed.body);
    const deals = await db.query('SELECT 1 FROM suite_deals WHERE space_id=$1', [space]);
    assert.equal(deals.rows.length, 1);
    const orders = await db.query('SELECT 1 FROM suite_projects WHERE space_id=$1', [space]);
    assert.equal(orders.rows.length, 0);
  });

  test('an owner who accepts an invitation to their own workspace stays the owner', async () => {
    const invite = async (email: string, role: string) => {
      const secret = randomUUID() + randomUUID();
      await db.query(
        "INSERT INTO suite_invitations(id,token_hash,space_id,email,role,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '1 day')",
        [randomUUID(), sha(secret), space, email, role, owner.id],
      );
      return secret;
    };
    const accept = async (user: { id: string; email: string }, secret: string) =>
      app.inject({
        method: 'POST',
        url: '/v2/invitations/accept',
        headers: await bearer(user),
        payload: { token: secret },
      });
    const role = async (userId: string) =>
      (
        await db.query<{ role: string }>(
          'SELECT role FROM suite_space_members WHERE space_id=$1 AND user_id=$2',
          [space, userId],
        )
      ).rows[0]?.role;

    assert.equal((await accept(owner, await invite(owner.email, 'viewer'))).statusCode, 200);
    assert.equal(await role(owner.id), 'owner');
    // Other members can still be moved to a new role by invitation.
    assert.equal((await accept(sales, await invite(sales.email, 'finance'))).statusCode, 200);
    assert.equal(await role(sales.id), 'finance');
    // Somebody else's invitation is useless even with its secret.
    const forViewer = await invite(viewer.email, 'manager');
    assert.equal((await accept(sales, forViewer)).statusCode, 403);
    assert.equal(await role(viewer.id), 'viewer');
  });

  test('sign-in sets a restricted cookie, clears expired sessions and refuses foreign origins', async () => {
    await app.close();
    app = start({ cookiePath: '/apps/business_suite/' });
    await db.query(
      "INSERT INTO suite_sessions(token_hash,encrypted_tokens,expires_at) VALUES('old','x',now()-interval '1 day'),('current','x',now()+interval '1 day')",
    );
    const login = await app.inject({
      method: 'POST',
      url: '/v2/auth/login',
      headers: { origin: APP_ORIGIN },
      payload: { email: owner.email, password: 'a-long-test-password' },
    });
    assert.equal(login.statusCode, 200, login.body);
    const cookie = String(login.headers['set-cookie']);
    assert.match(
      cookie,
      /^suite_session=[\w-]{40,60}; Path=\/apps\/business_suite\/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure$/,
    );
    const sessions = await db.query<{ token_hash: string }>(
      'SELECT token_hash FROM suite_sessions',
    );
    assert.equal(
      sessions.rows.some((s) => s.token_hash === 'old'),
      false,
    );
    assert.equal(
      sessions.rows.some((s) => s.token_hash === 'current'),
      true,
    );
    // The cookie value itself is never stored, only its hash.
    const value = /suite_session=([^;]+)/.exec(cookie)![1]!;
    assert.equal(
      sessions.rows.some((s) => s.token_hash === value),
      false,
    );
    assert.equal(
      sessions.rows.some((s) => s.token_hash === sha(value)),
      true,
    );

    const me = await app.inject({
      url: '/v2/auth/me',
      headers: { cookie: `suite_session=${value}` },
    });
    assert.equal(me.statusCode, 200, me.body);
    // A page on another site cannot use the signed-in browser to post commands.
    const foreign = await app.inject({
      method: 'POST',
      url: `/v2/workspaces/${space}/commands`,
      headers: { cookie: `suite_session=${value}`, origin: 'https://evil.example.test' },
      payload: { id: randomUUID(), workspaceId: space, type: 'contact.save', payload: {} },
    });
    assert.equal(foreign.statusCode, 403);
    assert.match(foreign.body, /ORIGIN_DENIED/);

    const logout = await app.inject({
      method: 'POST',
      url: '/v2/auth/logout',
      headers: { cookie: `suite_session=${value}`, origin: APP_ORIGIN },
    });
    assert.match(String(logout.headers['set-cookie']), /Path=\/apps\/business_suite\/;.*Max-Age=0/);
    const after = await app.inject({
      url: '/v2/auth/me',
      headers: { cookie: `suite_session=${value}` },
    });
    assert.equal(after.statusCode, 401);
    assert.throws(() => start({ cookiePath: 'apps; Domain=example.test' }), /cookie path/);
  });

  test('sign-in attempts are counted per visitor only behind a named proxy', async () => {
    const attempt = (server: ReturnType<typeof buildApp>, visitor: string) =>
      server.inject({
        method: 'POST',
        url: '/v2/auth/login',
        headers: { 'x-forwarded-for': visitor },
        payload: { email: 'nobody@example.com', password: 'wrong-password-123' },
      });
    // Without a named proxy the forwarded address is ignored, so it cannot be forged to
    // escape the limit; every request counts against the connecting address.
    for (let i = 0; i < 15; i++)
      assert.equal((await attempt(app, `203.0.113.${i}`)).statusCode, 401);
    assert.equal((await attempt(app, '203.0.113.200')).statusCode, 429);

    const proxied = start({ trustedProxies: ['127.0.0.1'] });
    try {
      for (let i = 0; i < 15; i++)
        assert.equal((await attempt(proxied, '203.0.113.7')).statusCode, 401);
      assert.equal((await attempt(proxied, '203.0.113.7')).statusCode, 429);
      // One noisy visitor no longer locks everybody else out.
      assert.equal((await attempt(proxied, '203.0.113.8')).statusCode, 401);
    } finally {
      await proxied.close();
    }
  });
});
