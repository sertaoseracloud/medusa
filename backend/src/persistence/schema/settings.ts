import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const settings = pgTable('settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  exchangeId: text('exchange_id').notNull().default('binance'),
  encryptedAccessKey: text('encrypted_access_key').notNull(),
  encryptedSecretKey: text('encrypted_secret_key').notNull(),
  keyVersion: text('key_version').notNull().default('v1'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
