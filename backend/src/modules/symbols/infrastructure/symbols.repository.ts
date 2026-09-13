import { and, asc, count, eq, ilike, max } from 'drizzle-orm';
import type { DrizzleDB } from '../../../persistence/db.js';
import { symbols } from '../../../persistence/schema/symbols.js';
import type { NormalizedSymbol } from '../../../exchanges/core/types.js';
import type { DrizzleTx, SymbolsFilter, SymbolsRepositoryPort } from '../domain/ports.js';
import type { SymbolRecord } from '../domain/symbol.entity.js';

// A full Binance spot market list can exceed the parameter limit of a single
// insert statement, so replaceAll chunks inserts at this size.
const INSERT_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function createSymbolsRepository(db: DrizzleDB): SymbolsRepositoryPort {
  return {
    async count(): Promise<number> {
      const [row] = await db.select({ value: count() }).from(symbols);
      return row?.value ?? 0;
    },

    async list(filter: SymbolsFilter = {}): Promise<SymbolRecord[]> {
      const conditions = [];
      if (filter.quote) {
        conditions.push(eq(symbols.quote, filter.quote));
      }
      if (filter.search) {
        conditions.push(ilike(symbols.symbol, `%${filter.search}%`));
      }

      const query = db.select().from(symbols).orderBy(asc(symbols.symbol));

      if (conditions.length === 0) {
        return query;
      }

      return db
        .select()
        .from(symbols)
        .where(and(...conditions))
        .orderBy(asc(symbols.symbol));
    },

    async lastSyncedAt(): Promise<Date | null> {
      const [row] = await db.select({ value: max(symbols.syncedAt) }).from(symbols);
      return row?.value ?? null;
    },

    async replaceAll(tx: DrizzleTx, rows: NormalizedSymbol[]): Promise<void> {
      await tx.delete(symbols);

      for (const batch of chunk(rows, INSERT_CHUNK_SIZE)) {
        await tx.insert(symbols).values(
          batch.map((row) => ({
            symbol: row.symbol,
            base: row.base,
            quote: row.quote,
            basePrecision: row.basePrecision,
            quotePrecision: row.quotePrecision,
            minNotional: row.minNotional,
            minLotSize: row.minLotSize,
          })),
        );
      }
    },
  };
}
