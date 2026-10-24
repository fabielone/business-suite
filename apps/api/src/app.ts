import Fastify, { type FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { DomainError, uuid, type Workspace } from '@suite/core';
import type { Database, Sql } from './database.js';
import { type Context, inContext, scope } from './context.js';
import { listJobs, createJob, closeJob } from './jobs.js';
import { listExpenses, submitExpense, reviewExpense } from './expenses.js';
import { type AuthConfig, createJwtVerifier } from './auth.js';
import { DEMO_IDS } from './demo-fixtures.js';

type Options = { database: Database } & (
  { mode: 'demo' } | { mode: 'real'; auth: AuthConfig; allowedOrigins?: string[] }
);
const DEMO_ORIGINS = new Set([
  'http://127.0.0.1:5178',
  'http://localhost:5178',
  'http://127.0.0.1:4310',
  'http://localhost:4310',
]);
export function buildApp(options: Options) {
  const demoSessionId = options.mode === 'demo' ? randomUUID() : undefined;
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024, trustProxy: false });
  const verify = options.mode === 'real' ? createJwtVerifier(options.auth) : undefined;
  const origins = options.mode === 'demo' ? DEMO_ORIGINS : new Set(options.allowedOrigins ?? []);
  app.addHook('onRequest', async (request, reply) => {
    if (options.mode === 'demo') {
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.ip)) {
        throw new DomainError(
          403,
          'DEMO_LOOPBACK_ONLY',
          'The demo is available only on this computer.',
        );
      }
      if (
        !['127.0.0.1:4310', 'localhost:4310', '[::1]:4310'].includes(request.headers.host ?? '')
      ) {
        throw new DomainError(403, 'DEMO_HOST_DENIED', 'Use the documented loopback demo address.');
      }
      const expectedSession = request.headers['x-demo-session-id'];
      if (
        request.method === 'POST' &&
        expectedSession !== undefined &&
        expectedSession !== demoSessionId
      ) {
        throw new DomainError(
          409,
          'DEMO_SESSION_CHANGED',
          'The demo database has restarted. This saved command belongs to an earlier demo session.',
        );
      }
    }
    const origin = request.headers.origin;
    if (origin && !origins.has(origin))
      throw new DomainError(403, 'ORIGIN_DENIED', 'This browser origin is not allowed.');
    if (origin) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      reply.header(
        'Access-Control-Allow-Headers',
        'Authorization,Content-Type,Idempotency-Key,X-Business-Id' +
          (options.mode === 'demo' ? ',X-Demo-User,X-Demo-Session-Id' : ''),
      );
    }
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    if (request.method === 'OPTIONS') return reply.code(204).send();
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError)
      return reply.code(error.status).send({ error: { code: error.code, message: error.message } });
    const sqlCode = (error as { code?: string }).code;
    if (['23503', '23514', '22003', '22P02'].includes(sqlCode ?? '')) {
      return reply.code(400).send({
        error: { code: 'INVALID_INPUT', message: 'The data violates a record constraint.' },
      });
    }
    if (['40001', '40P01', '23505'].includes(sqlCode ?? '')) {
      return reply.code(409).send({
        error: {
          code: 'CONFLICT',
          message: 'A concurrent change prevented this command. Retry with the same key.',
        },
      });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 413) {
      return reply.code(413).send({
        error: { code: 'REQUEST_TOO_LARGE', message: 'The request exceeds the 64 KiB limit.' },
      });
    }
    if (statusCode === 415) {
      return reply.code(415).send({
        error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Send commands as application/json.' },
      });
    }
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply
        .code(statusCode)
        .send({ error: { code: 'INVALID_INPUT', message: 'The request is invalid.' } });
    }
    return reply
      .code(500)
      .send({ error: { code: 'INTERNAL_ERROR', message: 'The command could not be completed.' } });
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      error: { code: 'NOT_FOUND', message: 'This API route is not available.' },
    }),
  );
  async function run<T>(
    request: FastifyRequest,
    operation: (tx: Sql, context: Context) => Promise<T>,
  ): Promise<T> {
    let actorId: string;
    if (options.mode === 'demo') {
      const selection = request.headers['x-demo-user'] ?? 'manager';
      if (selection !== 'manager' && selection !== 'worker') {
        throw new DomainError(401, 'INVALID_DEMO_USER', 'Choose manager or worker for this demo.');
      }
      actorId = DEMO_IDS[selection];
    } else {
      actorId = await verify!(request.headers.authorization);
    }
    const rawBusiness =
      request.headers['x-business-id'] ?? (options.mode === 'demo' ? DEMO_IDS.business : undefined);
    if (!rawBusiness)
      throw new DomainError(400, 'BUSINESS_REQUIRED', 'Choose a business with X-Business-Id.');
    const businessId = uuid(rawBusiness, 'Business');
    return inContext(options.database, actorId, businessId, operation);
  }
  app.get('/healthz', async () => ({ status: 'ok', demo: options.mode === 'demo' }));
  app.get('/v1/workspace', async (request) =>
    run(request, async (tx, context): Promise<Workspace> => {
      const permissions = [...context.grants.keys()]
        .filter((permission) => scope(context, permission))
        .sort();
      const result: Workspace = {
        business: { id: context.businessId, name: context.businessName, currency: 'MXN' },
        user: { id: context.actorId, name: context.userName },
        modules: context.modules,
        permissions,
        demo: options.mode === 'demo',
        ...(demoSessionId ? { demoSessionId } : {}),
      };
      if (scope(context, 'work.jobs.create') === 'business') {
        result.members = (
          await tx.query<{ id: string; name: string }>(
            'SELECT u.id,u.name FROM memberships m JOIN suite_users u ON u.id=m.user_id ' +
              'WHERE m.business_id=$1 AND m.active ORDER BY u.name',
            [context.businessId],
          )
        ).rows;
      }
      return result;
    }),
  );
  app.get('/v1/jobs', async (request) => run(request, listJobs));
  app.post('/v1/jobs', async (request, reply) => {
    const result = await run(request, (tx, context) =>
      createJob(tx, context, request.body, request.headers['idempotency-key']),
    );
    return reply.code(201).send(result);
  });
  app.post<{ Params: { id: string } }>('/v1/jobs/:id/close', async (request) =>
    run(request, (tx, context) =>
      closeJob(tx, context, request.params.id, request.body, request.headers['idempotency-key']),
    ),
  );
  app.get('/v1/expenses', async (request) => run(request, listExpenses));
  app.post('/v1/expenses', async (request, reply) => {
    const result = await run(request, (tx, context) =>
      submitExpense(tx, context, request.body, request.headers['idempotency-key']),
    );
    return reply.code(201).send(result);
  });
  app.post<{ Params: { id: string } }>('/v1/expenses/:id/review', async (request) =>
    run(request, (tx, context) =>
      reviewExpense(
        tx,
        context,
        request.params.id,
        request.body,
        request.headers['idempotency-key'],
      ),
    ),
  );
  app.options('/*', async (_request, reply) => reply.code(204).send());
  return app;
}
