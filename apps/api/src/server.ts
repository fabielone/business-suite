import { PostgresDatabase } from './database.js';
import { authConfig } from './auth.js';
import { buildApp } from './app.js';

// Read/validate authentication before attempting any connection. No fixture
// initialization or auth-failure fallback can start the demo process.
const auth = authConfig(process.env);
if (!process.env.DATABASE_URL)
  throw new Error(
    'DATABASE_URL is required. Run migrations separately before starting the real API.',
  );
const port = Number(process.env.API_PORT ?? 4310);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('API_PORT is invalid.');
const database = new PostgresDatabase(process.env.DATABASE_URL);
try {
  const role = (
    await database.query<{ rolsuper: boolean; rolbypassrls: boolean; owns_tables: boolean }>(
      'SELECT r.rolsuper,r.rolbypassrls,EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace ' +
        "WHERE pg_has_role(current_user,c.relowner,'USAGE') AND n.nspname='public' AND c.relkind IN ('r','p')) AS owns_tables " +
        'FROM pg_roles r WHERE r.rolname=current_user',
    )
  ).rows[0];
  if (!role || role.rolsuper || role.rolbypassrls || role.owns_tables) {
    throw new Error(
      'The real API requires a non-owner PostgreSQL role without SUPERUSER or BYPASSRLS.',
    );
  }
  const app = buildApp({
    database,
    mode: 'real',
    auth,
    allowedOrigins: (process.env.API_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  });
  app.addHook('onClose', () => database.close());
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      void app.close();
    });
  await app.listen({ host: process.env.API_HOST ?? '127.0.0.1', port });
  console.log(
    'Business Suite authenticated API listening on port ' + port + '. Demo headers are ignored.',
  );
} catch (error) {
  await database.close();
  throw error;
}
