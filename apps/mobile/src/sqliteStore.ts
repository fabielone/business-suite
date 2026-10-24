import { emptyState, type LocalState, type LocalStore } from '@suite/offline';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

/** One serialized connection per identity. The server epoch lives in the stored snapshot. */
const stores = new Map<string, LocalStore>();

export function sqliteStore(namespace: string): LocalStore {
  const existing = stores.get(namespace);
  if (existing) return existing;

  let database: Promise<SQLiteDatabase> | undefined;
  let tail: Promise<unknown> = Promise.resolve();
  const open = () => {
    database ??= openDatabaseAsync(`${namespace}.sqlite`).then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = FULL;
        PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS local_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          data TEXT NOT NULL
        );
      `);
      await db.runAsync(
        'INSERT OR IGNORE INTO local_state (id, data) VALUES (1, ?)',
        JSON.stringify(emptyState()),
      );
      return db;
    });
    return database;
  };
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  };
  const parse = (row: { data: string } | null): LocalState => {
    if (!row) throw new Error('The local database could not be read. It has not been reset.');
    try {
      const state = JSON.parse(row.data) as LocalState;
      if (state.schemaVersion !== 1 || !Array.isArray(state.commands)) throw new Error();
      return state;
    } catch {
      throw new Error(
        'The local database needs a supported migration or repair. Your stored data has not been overwritten.',
      );
    }
  };
  const store: LocalStore = {
    read: () =>
      serial(async () =>
        parse(
          await (
            await open()
          ).getFirstAsync<{ data: string }>('SELECT data FROM local_state WHERE id = 1'),
        ),
      ),
    update: (change) =>
      serial(async () => {
        const db = await open();
        let next!: LocalState;
        await db.withExclusiveTransactionAsync(async (transaction) => {
          // Acquire the SQLite writer lock before reading the state we will change.
          await transaction.runAsync('UPDATE local_state SET data = data WHERE id = 1');
          const current = parse(
            await transaction.getFirstAsync<{ data: string }>(
              'SELECT data FROM local_state WHERE id = 1',
            ),
          );
          next = change(current);
          await transaction.runAsync(
            'UPDATE local_state SET data = ? WHERE id = 1',
            JSON.stringify(next),
          );
        });
        // Resolve only after SQLite commits, never before the durable local save.
        return next;
      }),
  };
  stores.set(namespace, store);
  return store;
}
