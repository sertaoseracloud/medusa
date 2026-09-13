import { pgTable, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';

export const symbols = pgTable(
  'symbols',
  {
    symbol: text('symbol').primaryKey(),
    base: text('base').notNull(),
    quote: text('quote').notNull(),
    basePrecision: integer('base_precision').notNull(),
    quotePrecision: integer('quote_precision').notNull(),
    minNotional: text('min_notional'),
    minLotSize: text('min_lot_size'),
    isFavorite: boolean('is_favorite').notNull().default(false),
    syncedAt: timestamp('synced_at').notNull().defaultNow(),
  },
  (table) => [index('symbols_quote_idx').on(table.quote)],
);
