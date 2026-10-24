import { PostgresDatabase, migrate } from './database.js';

if (!process.env.DATABASE_URL)
  throw new Error('DATABASE_URL is required for the migration command.');
const database = new PostgresDatabase(process.env.DATABASE_URL);
try {
  await migrate(database);
  console.log('Business Suite migrations applied. No fixtures or identities were provisioned.');
} finally {
  await database.close();
}
