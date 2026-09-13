import { describe, it, expect } from 'vitest';
import { asc } from 'drizzle-orm';
import { testDb } from '../setup/db.js';
import { symbols } from '../../src/persistence/schema/symbols.js';
import type { IExchangeAdapter } from '../../src/exchanges/core/exchange-adapter.interface.js';
import type { NormalizedSymbol } from '../../src/exchanges/core/types.js';
import { createSymbolsRepository } from '../../src/modules/symbols/infrastructure/symbols.repository.js';
import { createSyncSymbolsUseCase } from '../../src/modules/symbols/application/sync-symbols.use-case.js';

// This adapter never touches ccxt/Binance — getSymbols is fully controlled by
// each test, satisfying the "never call the real exchange in tests" rule.
function createFakeAdapter(getSymbolsImpl: () => Promise<NormalizedSymbol[]>): IExchangeAdapter {
  return {
    id: 'fake',
    async testConnection() {},
    async getBalance() {
      return [];
    },
    getSymbols: getSymbolsImpl,
  };
}

const SEED_SYMBOLS: NormalizedSymbol[] = [
  { symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT', basePrecision: 8, quotePrecision: 2, minNotional: '10', minLotSize: '0.0001' },
  { symbol: 'ETH/USDT', base: 'ETH', quote: 'USDT', basePrecision: 8, quotePrecision: 2, minNotional: '10', minLotSize: '0.001' },
  { symbol: 'BNB/USDT', base: 'BNB', quote: 'USDT', basePrecision: 8, quotePrecision: 2, minNotional: '10', minLotSize: '0.01' },
];

async function seedSymbols(): Promise<void> {
  const repo = createSymbolsRepository(testDb);
  await testDb.transaction(async (tx) => {
    await repo.replaceAll(tx, SEED_SYMBOLS);
  });
}

function buildBatchWithBadSecondChunk(): NormalizedSymbol[] {
  // INSERT_CHUNK_SIZE is 500 — build 501 rows so the bad row lands in the
  // second insert chunk (index 500), after the first chunk has already run
  // inside the same transaction.
  const rows: NormalizedSymbol[] = [];
  for (let i = 0; i < 500; i += 1) {
    rows.push({
      symbol: `FAKE${i}/USDT`,
      base: `FAKE${i}`,
      quote: 'USDT',
      basePrecision: 8,
      quotePrecision: 2,
      minNotional: null,
      minLotSize: null,
    });
  }
  // This row violates the NOT NULL constraint on `base`, forcing the second
  // chunk's insert to reject mid-transaction.
  rows.push({
    symbol: 'BAD/USDT',
    base: null as unknown as string,
    quote: 'USDT',
    basePrecision: 8,
    quotePrecision: 2,
    minNotional: null,
    minLotSize: null,
  });
  return rows;
}

describe('sync-symbols.use-case atomicity', () => {
  it('rolls back and leaves the previous symbol set intact when the insert fails partway', async () => {
    await seedSymbols();

    const adapter = createFakeAdapter(async () => buildBatchWithBadSecondChunk());
    const repo = createSymbolsRepository(testDb);
    const useCase = createSyncSymbolsUseCase({ db: testDb, symbols: repo, adapter });

    await expect(useCase.execute()).rejects.toBeTruthy();

    const rows = await testDb.select().from(symbols).orderBy(asc(symbols.symbol));
    expect(rows).toHaveLength(SEED_SYMBOLS.length);
    expect(rows.map((r) => r.symbol).sort()).toEqual(SEED_SYMBOLS.map((s) => s.symbol).sort());
  });

  it('replaces the table with exactly the adapter rows on a successful sync', async () => {
    await seedSymbols();

    const newBatch: NormalizedSymbol[] = [
      { symbol: 'SOL/USDT', base: 'SOL', quote: 'USDT', basePrecision: 8, quotePrecision: 2, minNotional: '5', minLotSize: '0.01' },
      { symbol: 'ADA/USDT', base: 'ADA', quote: 'USDT', basePrecision: 8, quotePrecision: 2, minNotional: '5', minLotSize: '1' },
    ];

    const adapter = createFakeAdapter(async () => newBatch);
    const repo = createSymbolsRepository(testDb);
    const useCase = createSyncSymbolsUseCase({ db: testDb, symbols: repo, adapter });

    const result = await useCase.execute();
    expect(result.count).toBe(newBatch.length);

    const rows = await testDb.select().from(symbols).orderBy(asc(symbols.symbol));
    expect(rows).toHaveLength(newBatch.length);
    expect(rows.map((r) => r.symbol).sort()).toEqual(newBatch.map((s) => s.symbol).sort());
  });

  it('rejects and leaves previous rows intact when the adapter returns zero symbols', async () => {
    await seedSymbols();

    const adapter = createFakeAdapter(async () => []);
    const repo = createSymbolsRepository(testDb);
    const useCase = createSyncSymbolsUseCase({ db: testDb, symbols: repo, adapter });

    await expect(useCase.execute()).rejects.toBeTruthy();

    const rows = await testDb.select().from(symbols).orderBy(asc(symbols.symbol));
    expect(rows).toHaveLength(SEED_SYMBOLS.length);
  });
});
