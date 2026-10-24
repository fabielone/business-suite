import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export interface Sql {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
}
export interface Database extends Sql {
  transaction<T>(run: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Real PostgreSQL: every command uses one checked-out connection. */
export class PostgresDatabase implements Database {
  private readonly pool: pg.Pool;
  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5_000 });
  }
  async query<T>(sql: string, values: unknown[] = []): Promise<{ rows: T[] }> {
    const result = await this.pool.query(sql, values);
    return { rows: result.rows as T[] };
  }
  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }
  async transaction<T>(run: (tx: Sql) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const tx: Sql = {
      query: async <R>(sql: string, values: unknown[] = []) => {
        const result = await client.query(sql, values);
        return { rows: result.rows as R[] };
      },
      exec: async (sql) => {
        await client.query(sql);
      },
    };
    try {
      await client.query('BEGIN');
      const result = await run(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** Embedded demo only. It never reads DATABASE_URL or writes a persistent directory. */
export class DemoDatabase implements Database {
  private readonly db = new PGlite();
  private tail: Promise<unknown> = Promise.resolve();
  private exclusive<T>(run: () => Promise<T>): Promise<T> {
    const next = this.tail.then(run, run);
    this.tail = next.catch(() => undefined);
    return next;
  }
  query<T>(sql: string, values: unknown[] = []): Promise<{ rows: T[] }> {
    return this.exclusive(async () => ({ rows: (await this.db.query<T>(sql, values)).rows }));
  }
  exec(sql: string): Promise<void> {
    return this.exclusive(async () => {
      await this.db.exec(sql);
    });
  }
  transaction<T>(run: (tx: Sql) => Promise<T>): Promise<T> {
    return this.exclusive(() =>
      this.db.transaction(async (transaction) =>
        run({
          query: async <R>(sql: string, values: unknown[] = []) => ({
            rows: (await transaction.query<R>(sql, values)).rows,
          }),
          exec: async (sql) => {
            await transaction.exec(sql);
          },
        }),
      ),
    );
  }
  close(): Promise<void> {
    return this.exclusive(() => this.db.close());
  }
}

export async function migrate(database: Database): Promise<void> {
  const directory = fileURLToPath(new URL('../../../db/migrations/', import.meta.url));
  const files = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  await database.exec(
    'CREATE TABLE IF NOT EXISTS suite_schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  await database.transaction(async (tx) => {
    await tx.exec('LOCK TABLE suite_schema_migrations IN EXCLUSIVE MODE');
    for (const file of files) {
      const sql = await readFile(directory + '/' + file, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const found = await tx.query<{ checksum: string }>(
        'SELECT checksum FROM suite_schema_migrations WHERE name=$1',
        [file],
      );
      if (found.rows[0]) {
        if (found.rows[0].checksum !== checksum)
          throw new Error('Applied migration was modified: ' + file);
        continue;
      }
      await tx.exec(sql);
      await tx.query('INSERT INTO suite_schema_migrations(name, checksum) VALUES ($1,$2)', [
        file,
        checksum,
      ]);
    }
  });
}
