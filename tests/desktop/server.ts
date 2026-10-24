/** Test runner only: real demo routes/database with a controllable service outage.
 * This file is never imported by a shipped app or API entry point.
 */
import { buildApp } from '../../apps/api/src/app.js';
import { DemoDatabase, migrate } from '../../apps/api/src/database.js';
import { seedDemo } from '../../apps/api/src/demo-fixtures.js';

const database = new DemoDatabase();
await migrate(database);
await seedDemo(database);
const app = buildApp({ database, mode: 'demo' });
let unavailable = false;
const traffic: { method: string; path: string; key: string | null }[] = [];

app.addHook('onRequest', async (request, reply) => {
  if (!request.url.startsWith('/v1/')) return;
  traffic.push({
    method: request.method,
    path: request.url,
    key:
      typeof request.headers['idempotency-key'] === 'string'
        ? request.headers['idempotency-key']
        : null,
  });
  if (unavailable)
    return reply.code(503).send({
      error: {
        code: 'TEST_SERVICE_UNAVAILABLE',
        message:
          'The test has temporarily disconnected the local API. Saved entries remain on this device.',
      },
    });
});

app.post<{ Body: { unavailable: boolean } }>('/__test/network', async (request, reply) => {
  if (typeof request.body?.unavailable !== 'boolean')
    return reply.code(400).send({ error: 'unavailable must be a boolean' });
  unavailable = request.body.unavailable;
  return { unavailable };
});
app.get('/__test/traffic', async () => ({ traffic }));
app.addHook('onClose', () => database.close());
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close();
  });
await app.listen({ host: '127.0.0.1', port: 4310 });
