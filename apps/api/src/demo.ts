import { DemoDatabase, migrate } from './database.js';
import { seedDemo } from './demo-fixtures.js';
import { buildApp } from './app.js';

const database = new DemoDatabase();
await migrate(database);
await seedDemo(database);
const app = buildApp({ database, mode: 'demo' });
app.addHook('onClose', () => database.close());
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void app.close();
  });
await app.listen({ host: '127.0.0.1', port: 4310 });
console.log(
  'Business Suite DEMO at http://127.0.0.1:4310 — ephemeral sample data; no real receipts or payments.',
);
