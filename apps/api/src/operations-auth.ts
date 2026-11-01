import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes, createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';
import { SignJWT, decodeJwt } from 'jose';
import { DomainError } from '@suite/core';
import { emptyData, executeCommand } from '@suite/core/operations';
import { randomUUID } from 'node:crypto';
import type { Database } from './database.js';
import { createJwtVerifier, type AuthConfig } from './auth.js';

type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
};
export type Identity = { id: string; email: string; name: string };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const fail = (message: string) => new DomainError(401, 'SIGN_IN_REQUIRED', message);
const cookieName = 'suite_session';
export function operationsAuth(
  app: FastifyInstance,
  db: Database,
  config: AuthConfig,
  secure = true,
) {
  const verify = createJwtVerifier(config);
  const key = config.secret
    ? Buffer.from(hkdfSync('sha256', config.secret, '', 'business-suite-session-v1', 32))
    : null;
  const authBase = (process.env.SUITE_AUTH_INTERNAL_URL || config.issuer).replace(/\/$/, '');
  const seal = (tokens: Tokens) => {
    if (!key) throw new Error('Session encryption requires server configuration.');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    return Buffer.concat([
      iv,
      cipher.update(JSON.stringify(tokens)),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64');
  };
  const open = (value: string): Tokens => {
    if (!key) throw new Error('Session encryption unavailable.');
    const bytes = Buffer.from(value, 'base64');
    const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(-16));
    return JSON.parse(
      Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString(),
    );
  };
  const cookie = (r: FastifyRequest) =>
    r.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1);
  const setCookie = (reply: FastifyReply, value: string, age: number) =>
    reply.header(
      'Set-Cookie',
      `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure || reply.request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`,
    );
  const upstream = async (path: string, body?: unknown, token?: string) => {
    let response: Response;
    try {
      response = await fetch(authBase + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
        redirect: 'error',
      });
    } catch {
      throw new DomainError(
        503,
        'AUTH_UNAVAILABLE',
        'The sign-in service is unavailable. Please try again.',
      );
    }
    const result = (await response.json()) as Record<string, unknown>;
    if (!response.ok)
      throw fail('Sign-in was not accepted. Check your details or use your invitation link.');
    return result;
  };
  const identityFromToken = async (token: string): Promise<Identity> => {
    const userId = await verify('Bearer ' + token);
    const payload = decodeJwt(token);
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    const meta = payload.user_metadata as Record<string, unknown> | undefined;
    return {
      id: userId,
      email,
      name:
        typeof meta?.name === 'string' ? meta.name.slice(0, 160) : email.split('@')[0] || 'Member',
    };
  };
  const saveSession = async (tokens: Tokens, reply: FastifyReply) => {
    await identityFromToken(tokens.access_token);
    const secret = randomBytes(32).toString('base64url');
    const expiry = new Date(Date.now() + 7 * 86400000);
    await db.query(
      'INSERT INTO suite_sessions(token_hash,encrypted_tokens,expires_at) VALUES($1,$2,$3)',
      [hash(secret), seal(tokens), expiry.toISOString()],
    );
    setCookie(reply, secret, 7 * 86400);
  };
  const authenticate = async (request: FastifyRequest): Promise<Identity> => {
    if (request.headers.authorization)
      return identityFromToken(request.headers.authorization.replace(/^Bearer /i, ''));
    const secret = cookie(request);
    if (!secret || !/^[\w-]{40,60}$/.test(secret)) throw fail('Sign in to your workspace.');
    return db.transaction(async (tx) => {
      const result = await tx.query<{
        encrypted_tokens: string;
        expires_at: string;
      }>('SELECT encrypted_tokens,expires_at FROM suite_sessions WHERE token_hash=$1 FOR UPDATE', [
        hash(secret),
      ]);
      const session = result.rows[0];
      if (!session || Date.parse(session.expires_at) <= Date.now())
        throw fail('Your session expired. Sign in again.');
      let tokens = open(session.encrypted_tokens);
      try {
        if ((decodeJwt(tokens.access_token).exp ?? 0) * 1000 < Date.now() + 30000)
          throw new Error('refresh');
        return await identityFromToken(tokens.access_token);
      } catch {
        tokens = (await upstream('/token?grant_type=refresh_token', {
          refresh_token: tokens.refresh_token,
        })) as unknown as Tokens;
        const identity = await identityFromToken(tokens.access_token);
        await tx.query('UPDATE suite_sessions SET encrypted_tokens=$2 WHERE token_hash=$1', [
          hash(secret),
          seal(tokens),
        ]);
        return identity;
      }
    });
  };
  const attempts = new Map<string, { count: number; reset: number }>();
  const limit = (request: FastifyRequest) => {
    const key = request.ip;
    const value = attempts.get(key);
    const current =
      value && value.reset > Date.now() ? value : { count: 0, reset: Date.now() + 60000 };
    current.count++;
    attempts.set(key, current);
    if (current.count > 15)
      throw new DomainError(429, 'RATE_LIMIT', 'Too many attempts. Wait a minute and try again.');
    if (attempts.size > 10000)
      for (const [k, v] of attempts) if (v.reset < Date.now()) attempts.delete(k);
  };
  app.post('/v2/auth/login', async (request, reply) => {
    limit(request);
    const p = request.body as Record<string, unknown>;
    if (
      !p ||
      typeof p.email !== 'string' ||
      typeof p.password !== 'string' ||
      p.email.length > 254 ||
      p.password.length > 1024
    )
      throw fail('Enter your email and password.');
    const tokens = (await upstream('/token?grant_type=password', {
      email: p.email,
      password: p.password,
    })) as unknown as Tokens;
    await saveSession(tokens, reply);
    return { user: await identityFromToken(tokens.access_token) };
  });
  app.get('/v2/auth/me', async (request) => ({
    user: await authenticate(request),
  }));
  app.post('/v2/auth/logout', async (request, reply) => {
    const secret = cookie(request);
    if (secret) await db.query('DELETE FROM suite_sessions WHERE token_hash=$1', [hash(secret)]);
    setCookie(reply, '', 0);
    return { signedOut: true };
  });
  app.post('/v2/auth/activate', async (request, reply) => {
    limit(request);
    const p = request.body as Record<string, unknown>;
    if (
      !p ||
      typeof p.token !== 'string' ||
      p.token.length > 200 ||
      typeof p.name !== 'string' ||
      p.name.trim().length < 1 ||
      p.name.length > 160 ||
      typeof p.password !== 'string' ||
      p.password.length < 12 ||
      p.password.length > 1024
    )
      throw new DomainError(
        400,
        'INVALID_ACTIVATION',
        'Use your invitation, a name and a password of at least 12 characters.',
      );
    if (!config.secret)
      throw new DomainError(
        503,
        'ACTIVATION_UNAVAILABLE',
        'Account activation has not been configured.',
      );
    const invitation = (
      await db.query<{ email: string }>(
        'SELECT email FROM suite_invitations WHERE token_hash=$1 AND accepted_by IS NULL AND expires_at>now()',
        [hash(p.token)],
      )
    ).rows[0];
    if (!invitation)
      throw new DomainError(
        400,
        'INVITATION_INVALID',
        'This invitation is invalid, expired or already used.',
      );
    const admin = await new SignJWT({ role: 'business_suite_service' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('2m')
      .sign(new TextEncoder().encode(config.secret));
    // The invitation fixes the email and grants. The request cannot choose them.
    await upstream(
      '/admin/users',
      {
        email: invitation.email,
        password: p.password,
        email_confirm: true,
        user_metadata: { name: p.name.trim() },
      },
      admin,
    );
    const tokens = (await upstream('/token?grant_type=password', {
      email: invitation.email,
      password: p.password,
    })) as unknown as Tokens;
    const user = await identityFromToken(tokens.access_token);
    await acceptInvitation(String(p.token), user);
    await saveSession(tokens, reply);
    return { user };
  });
  const acceptInvitation = async (token: string, user: Identity) =>
    db.transaction(async (tx) => {
      const invitation = (
        await tx.query<{
          id: string;
          space_id: string | null;
          email: string;
          role: string;
        }>(
          'SELECT id,space_id,email,role FROM suite_invitations WHERE token_hash=$1 AND accepted_by IS NULL AND expires_at>now() FOR UPDATE',
          [hash(token)],
        )
      ).rows[0];
      if (!invitation || invitation.email.toLowerCase() !== user.email)
        throw new DomainError(
          403,
          'INVITATION_INVALID',
          'Sign in with the email address this invitation was created for.',
        );
      if (invitation.space_id) {
        await tx.query(
          "SELECT set_config('suite.space_id',$1,true),set_config('suite.user_id',$2,true)",
          [invitation.space_id, user.id],
        );
        await tx.query(
          'INSERT INTO suite_space_members(space_id,user_id,email,name,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT(space_id,user_id) DO UPDATE SET active=true,role=EXCLUDED.role',
          [invitation.space_id, user.id, user.email, user.name, invitation.role],
        );
      } else {
        // A manually provisioned owner invitation starts three empty, independent spaces.
        for (const [name, preset] of [
          ['Insignia', 'signage'],
          ['Household', 'household'],
          ['Referrals', 'referrals'],
        ]) {
          const id = randomUUID();
          const data = executeCommand(emptyData(), {
            id,
            workspaceId: id,
            type: 'workspace.create',
            payload: { name, preset, currency: 'MXN' },
          });
          await tx.query(
            "SELECT set_config('suite.space_id',$1,true),set_config('suite.user_id',$2,true)",
            [id, user.id],
          );
          await tx.query(
            'INSERT INTO suite_spaces(id,owner_id,config,revision) VALUES($1,$2,$3::jsonb,$4)',
            [id, user.id, JSON.stringify(data.workspaces[0]), data.revision],
          );
          await tx.query(
            "INSERT INTO suite_space_members(space_id,user_id,email,name,role) VALUES($1,$2,$3,$4,'owner')",
            [id, user.id, user.email, user.name],
          );
          await tx.query(
            'INSERT INTO suite_space_audit(space_id,id,actor_id,payload) VALUES($1,$2,$3,$4::jsonb)',
            [id, id, user.id, JSON.stringify(data.audit[0])],
          );
        }
      }
      await tx.query('UPDATE suite_invitations SET accepted_by=$2 WHERE id=$1', [
        invitation.id,
        user.id,
      ]);
      return { accepted: true };
    });
  app.post('/v2/invitations/accept', async (request) => {
    const user = await authenticate(request);
    const p = request.body as Record<string, unknown>;
    if (typeof p?.token !== 'string' || p.token.length > 200)
      throw new DomainError(400, 'INVALID_INPUT', 'Invitation token required.');
    return acceptInvitation(p.token, user);
  });
  return { authenticate, hash };
}
