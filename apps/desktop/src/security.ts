import { isAbsolute, relative, resolve, sep } from 'node:path';

export const APP_URL = 'suite://app/';
export const API_BASE = 'http://127.0.0.1:4310/v1';
export const MAX_BYTES = 64 * 1024;
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "worker-src 'none'",
  "manifest-src 'self'",
].join('; ');
export type DesktopMode = 'demo' | 'setup';
export interface BridgeInput {
  path: string;
  role: 'manager' | 'worker';
  businessId?: string;
  body?: unknown;
  idempotencyKey?: string;
  demoSessionId?: string;
}
export interface ValidatedRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bodyRoute = new RegExp('^/(?:jobs/[0-9a-f-]{36}/close|expenses/[0-9a-f-]{36}/review)$', 'i');
const plainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

export function desktopMode(input: {
  isPackaged: boolean;
  args: string[];
  metadata: unknown;
}): DesktopMode {
  if (
    !plainObject(input.metadata) ||
    typeof input.metadata.mode !== 'string' ||
    !['demo', 'setup'].includes(input.metadata.mode)
  ) {
    throw new Error('Desktop build metadata is missing or invalid. Rebuild this application.');
  }
  const mode = input.metadata.mode as DesktopMode;
  if (mode === 'demo' && !input.isPackaged && !input.args.includes('--demo')) {
    throw new Error('This development demo requires the explicit --demo flag.');
  }
  // A launch flag cannot turn a setup artifact into a demo artifact.
  return mode;
}

export function isTrustedSender(input: {
  senderId: number;
  expectedSenderId: number;
  isMainFrame: boolean;
  url: string;
}): boolean {
  // Same-document fragments (including the skip link) do not change the trusted document.
  const documentUrl = input.url.split('#', 1)[0];
  return input.senderId === input.expectedSenderId && input.isMainFrame && documentUrl === APP_URL;
}

export function validateRequest(value: unknown): ValidatedRequest {
  if (
    !plainObject(value) ||
    Object.keys(value).some(
      (key) =>
        !['path', 'role', 'businessId', 'body', 'idempotencyKey', 'demoSessionId'].includes(key),
    )
  )
    throw new Error('Invalid request fields.');
  if (value.role !== 'manager' && value.role !== 'worker')
    throw new Error('Invalid demo identity.');
  if (typeof value.path !== 'string') throw new Error('Invalid API route.');
  const hasBody = value.body !== undefined;
  const listRoute = ['/workspace', '/jobs', '/expenses'].includes(value.path);
  const commandRoute = ['/jobs', '/expenses'].includes(value.path) || bodyRoute.test(value.path);
  if ((!hasBody && !listRoute) || (hasBody && !commandRoute))
    throw new Error('This route is not exposed by the desktop bridge.');
  if (bodyRoute.test(value.path) && !UUID.test(value.path.split('/')[2] ?? ''))
    throw new Error('Invalid record ID.');
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Demo-User': value.role };
  if (value.businessId !== undefined) {
    if (typeof value.businessId !== 'string' || !UUID.test(value.businessId))
      throw new Error('Invalid business ID.');
    headers['X-Business-Id'] = value.businessId;
  }
  if (value.demoSessionId !== undefined) {
    if (typeof value.demoSessionId !== 'string' || !UUID.test(value.demoSessionId))
      throw new Error('Invalid demo session.');
    headers['X-Demo-Session-Id'] = value.demoSessionId;
  }
  if (value.idempotencyKey !== undefined) {
    if (
      typeof value.idempotencyKey !== 'string' ||
      !/^[\x21-\x7e]{1,160}$/.test(value.idempotencyKey)
    )
      throw new Error('Invalid command key.');
    headers['Idempotency-Key'] = value.idempotencyKey;
  }
  let body: string | undefined;
  if (hasBody) {
    if (!plainObject(value.body)) throw new Error('Commands require a JSON object.');
    if (!value.idempotencyKey) throw new Error('Commands require an idempotency key.');
    body = JSON.stringify(value.body);
    if (Buffer.byteLength(body, 'utf8') > MAX_BYTES) throw new Error('Command exceeds 64 KiB.');
    headers['Content-Type'] = 'application/json';
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_BYTES)
    throw new Error('Bridge request exceeds 64 KiB including metadata.');
  return {
    url: API_BASE + value.path,
    method: hasBody ? 'POST' : 'GET',
    headers,
    ...(body === undefined ? {} : { body }),
  };
}

export function resolveAssetPath(rawUrl: string, rendererRoot: string): string | null {
  if (!rawUrl.startsWith(APP_URL) || /[?#\\\u0000]/.test(rawUrl)) return null;
  const rawPath = rawUrl.slice(APP_URL.length);
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (
    decoded.includes('\\') ||
    decoded.includes('\u0000') ||
    decoded.split('/').some((part) => part === '..' || part === '.')
  )
    return null;
  const target = resolve(rendererRoot, decoded || 'index.html');
  const within = relative(resolve(rendererRoot), target);
  if (!within || within.startsWith('..' + sep) || within === '..' || isAbsolute(within))
    return null;
  return target;
}
