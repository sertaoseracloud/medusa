import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(url: string): DrizzleDB {
  const client = postgres(url);
  return drizzle(client, { schema });
}

export const db: DrizzleDB = createDb(process.env.DATABASE_URL ?? '');
