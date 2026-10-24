import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import {
  API_BASE,
  APP_URL,
  CSP,
  MAX_BYTES,
  desktopMode,
  isTrustedSender,
  resolveAssetPath,
  validateRequest,
} from '../src/security';
import { executeRequest } from '../src/bridge';

const id = '20000000-0000-4000-8000-000000000002';
const get = { path: '/workspace', role: 'worker' };

test('setup metadata cannot be enabled by demo flags and development demos require explicit opt-in', () => {
  assert.equal(
    desktopMode({ isPackaged: false, args: ['--demo'], metadata: { mode: 'setup' } }),
    'setup',
  );
  assert.equal(
    desktopMode({ isPackaged: true, args: ['--demo'], metadata: { mode: 'setup' } }),
    'setup',
  );
  assert.throws(() => desktopMode({ isPackaged: false, args: [], metadata: { mode: 'demo' } }));
  assert.equal(
    desktopMode({ isPackaged: false, args: ['--demo'], metadata: { mode: 'demo' } }),
    'demo',
  );
  assert.equal(desktopMode({ isPackaged: true, args: [], metadata: { mode: 'demo' } }), 'demo');
  for (const metadata of [null, {}, { mode: 'production' }, { mode: true }]) {
    assert.throws(() => desktopMode({ isPackaged: false, args: ['--demo'], metadata }));
  }
});

test('only the expected top frame at the exact app document is a trusted IPC sender', () => {
  const trusted = { senderId: 12, expectedSenderId: 12, isMainFrame: true, url: APP_URL };
  assert.equal(isTrustedSender(trusted), true);
  assert.equal(isTrustedSender({ ...trusted, url: APP_URL + '#main' }), true);
  for (const change of [
    { senderId: 13 },
    { isMainFrame: false },
    { url: 'suite://app/index.html' },
    { url: 'suite://app.evil/' },
    { url: 'file:///index.html' },
    { url: 'https://example.invalid/' },
    { url: APP_URL + '?query#main' },
    { url: APP_URL + 'index.html#main' },
  ])
    assert.equal(isTrustedSender({ ...trusted, ...change }), false);
});

test('the bridge creates a fixed loopback destination and allows only known query/command routes', () => {
  assert.deepEqual(validateRequest(get), {
    url: API_BASE + '/workspace',
    method: 'GET',
    headers: { Accept: 'application/json', 'X-Demo-User': 'worker' },
  });
  const command = validateRequest({
    path: `/jobs/${id}/close`,
    role: 'worker',
    body: { version: 1 },
    idempotencyKey: 'command-1',
    demoSessionId: id,
  });
  assert.equal(command.url, API_BASE + `/jobs/${id}/close`);
  assert.equal(command.method, 'POST');
  assert.equal(command.headers['X-Demo-Session-Id'], id);
  assert.equal(command.headers['Idempotency-Key'], 'command-1');
  assert.equal(command.body, '{"version":1}');
  for (const input of [
    null,
    [],
    { ...get, path: 'https://example.invalid/' },
    { ...get, path: '//example.invalid/' },
    { ...get, path: '/workspace?forward=https://example.invalid' },
    { ...get, path: '/../../healthz' },
    { ...get, path: '/healthz' },
    { ...get, path: `/jobs/${id}/close` },
    { ...get, role: 'admin' },
    { ...get, url: 'file:///etc/passwd' },
    { ...get, headers: { Authorization: 'untrusted' } },
    { ...get, businessId: '../other' },
    { ...get, demoSessionId: 'invalid' },
    { ...get, path: '/expenses', body: {}, idempotencyKey: 'line\nbreak' },
    { ...get, path: '/expenses', body: {} },
    { ...get, path: '/workspace', body: {}, idempotencyKey: 'one' },
    { ...get, path: '/expenses', body: [], idempotencyKey: 'one' },
  ])
    assert.throws(() => validateRequest(input), Error, JSON.stringify(input));
});

test('command size is bounded in UTF-8 bytes before network access', () => {
  assert.throws(() =>
    validateRequest({
      path: '/expenses',
      role: 'worker',
      idempotencyKey: 'one',
      body: { description: 'é'.repeat(MAX_BYTES / 2) },
    }),
  );
  const nearLimitBody = { description: 'x'.repeat(MAX_BYTES - 30) };
  assert.ok(Buffer.byteLength(JSON.stringify(nearLimitBody)) < MAX_BYTES);
  assert.throws(() =>
    validateRequest({
      path: '/expenses',
      role: 'worker',
      idempotencyKey: 'one',
      body: nearLimitBody,
    }),
  );
});

test('bundled asset paths cannot escape the renderer or serve another origin', () => {
  const root = resolve('fixture-renderer');
  assert.equal(resolveAssetPath(APP_URL, root), resolve(root, 'index.html'));
  assert.equal(resolveAssetPath(APP_URL + 'assets/app.js', root), resolve(root, 'assets/app.js'));
  for (const url of [
    'file:///etc/passwd',
    'suite://other/index.html',
    'suite://app.evil/index.html',
    APP_URL + '../package.json',
    APP_URL + '%2e%2e/package.json',
    APP_URL + '%2Fetc/passwd',
    APP_URL + 'assets/../../main.js',
    APP_URL + 'assets%5c..%5cmain.js',
    APP_URL + 'assets/%00.js',
    APP_URL + 'assets/%',
    APP_URL + 'index.html?x=1',
    APP_URL + 'index.html#x',
  ])
    assert.equal(resolveAssetPath(url, root), null, url);
  assert.match(CSP, /connect-src 'none'/);
  assert.match(CSP, /frame-src 'none'/);
  assert.doesNotMatch(CSP, /unsafe-eval|unsafe-inline|https?:/);
});

test('setup and invalid requests fail closed without calling upstream', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json({});
  };
  const setup = await executeRequest(get, { mode: 'setup', fetcher });
  assert.equal(setup.status, 403);
  const invalid = await executeRequest(
    { ...get, path: 'https://example.invalid' },
    { mode: 'demo', fetcher },
  );
  assert.equal(invalid.status, 400);
  assert.equal(calls, 0);
});

test('upstream requests omit credentials, refuse redirects and preserve API status/errors', async () => {
  let sent: RequestInit | undefined;
  const result = await executeRequest(get, {
    mode: 'demo',
    fetcher: async (url, options) => {
      assert.equal(url, API_BASE + '/workspace');
      sent = options;
      return Response.json(
        { error: { code: 'FORBIDDEN', message: 'No membership.' } },
        { status: 403 },
      );
    },
  });
  assert.equal(result.status, 403);
  assert.equal(sent?.redirect, 'error');
  assert.equal(sent?.credentials, 'omit');
  assert.equal(sent?.cache, 'no-store');
  assert.deepEqual(result.data, { error: { code: 'FORBIDDEN', message: 'No membership.' } });
  const redirect = await executeRequest(get, {
    mode: 'demo',
    fetcher: async () =>
      new Response(null, { status: 302, headers: { Location: 'https://example.invalid' } }),
  });
  assert.equal(redirect.status, 502);
});

test('invalid or oversized responses and network failures are not successful acknowledgements', async () => {
  for (const response of [
    new Response('<html>wrong server</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('not JSON', { headers: { 'Content-Type': 'application/json' } }),
    new Response('x'.repeat(MAX_BYTES + 1), { headers: { 'Content-Type': 'application/json' } }),
  ])
    assert.equal(
      (await executeRequest(get, { mode: 'demo', fetcher: async () => response })).status,
      502,
    );
  const offline = await executeRequest(get, {
    mode: 'demo',
    fetcher: async () => {
      throw new Error('connection lost');
    },
  });
  assert.equal(offline.status, 0);
});
