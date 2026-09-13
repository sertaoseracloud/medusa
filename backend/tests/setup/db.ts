import { sql } from 'drizzle-orm';
import { getTableName } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { beforeEach } from 'vitest';
import * as schema from '../../src/persistence/schema/index.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL must be set to run the test suite.');
}

const client = postgres(testDatabaseUrl);
export const testDb = drizzle(client, { schema });

const tableNames = Object.values(schema)
  .filter((value): value is (typeof schema)[keyof typeof schema] => typeof value === 'object' && value !== null)
  .map((table) => getTableName(table as Parameters<typeof getTableName>[0]))
  .filter((name): name is string => typeof name === 'string');

export async function resetTables(): Promise<void> {
  if (tableNames.length === 0) return;
  const quoted = tableNames.map((name) => `"${name}"`).join(', ');
  await testDb.execute(sql.raw(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`));
}

beforeEach(async () => {
  await resetTables();
});
