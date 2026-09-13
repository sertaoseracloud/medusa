import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import argon2 from 'argon2';
import { testDb } from '../setup/db.js';
import { symbols } from '../../src/persistence/schema/symbols.js';
import { createUserRepository } from '../../src/modules/auth/infrastructure/user.repository.js';
import { createSymbolsRepository } from '../../src/modules/symbols/infrastructure/symbols.repository.js';
import { registerBootSymbolSync, type BootSymbolSyncApp } from '../../src/modules/symbols/infrastructure/boot-sync.js';
import { createSyncSymbolsUseCase } from '../../src/modules/symbols/application/sync-symbols.use-case.js';
import type { IExchangeAdapter } from '../../src/exchanges/core/exchange-adapter.interface.js';
import type { NormalizedSymbol } from '../../src/exchanges/core/types.js';
import { ExchangeUnavailableError } from '../../src/exchanges/core/errors.js';

let fetchMarketsImpl: () => Promise<unknown> = async () => [];

vi.mock('ccxt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ccxt')>();
  const actualDefault = actual.default as Record<string, unknown>;

  class MockBinance {
    fetchBalance() {
      return Promise.resolve({ free: {}, used: {}, total: {} });
    }

    fetchMarkets() {
      return fetchMarketsImpl();
    }
  }

  return {
    ...actual,
    default: { ...actualDefault, binance: MockBinance },
  };
});

const { buildApp } = await import('../../src/app.js');
type AppInstance = Awaited<ReturnType<typeof buildApp>>;

const SEED_EMAIL = 'symbols-test@example.com';
const SEED_PASSWORD = 'correct-horse-battery-staple';

const NORMALIZED_ROW: NormalizedSymbol = {
  symbol: 'BTC/USDT',
  base: 'BTC',
  quote: 'USDT',
  basePrecision: 8,
  quotePrecision: 2,
  minNotional: '10',
  minLotSize: '0.0001',
};

function createFakeAdapter(getSymbolsImpl: () => Promise<NormalizedSymbol[]>): IExchangeAdapter {
  return {
    id: 'fake',
    async testConnection() {},
    async getBalance() {
      return [];
    },
    getSymbols: getSymbolsImpl,
    dispose() {},
  };
}

/**
 * A fake Fastify-shaped app that captures the `onListen` handler and lets the
 * test invoke it directly and deterministically — real `app.listen()` timing
 * (whether the returned promise awaits `onListen` handlers) is an
 * implementation detail we should not depend on for this assertion.
 */
function createFakeBootApp(): BootSymbolSyncApp & { triggerListen(): Promise<void> } {
  let handler: (() => Promise<void>) | undefined;
  return {
    addHook(_name: 'onListen', fn: () => Promise<void>) {
      handler = fn;
    },
    log: {
      error: vi.fn(),
      info: vi.fn(),
    } as unknown as BootSymbolSyncApp['log'],
    async triggerListen() {
      if (!handler) throw new Error('onListen hook was not registered');
      await handler();
    },
  };
}

async function buildAppInstance(): Promise<AppInstance> {
  return buildApp({
    db: testDb,
    secrets: { JWT_SECRET: 'test-secret', AES_KEY: Buffer.alloc(32, 1) },
  });
}

beforeEach(() => {
  fetchMarketsImpl = async () => [];
});

describe('boot symbol sync (onListen gate, D-13/D-14/D-16)', () => {
  it('runs the sync exactly once and populates the table when it starts empty', async () => {
    const repo = createSymbolsRepository(testDb);
    let callCount = 0;
    const adapter = createFakeAdapter(async () => {
      callCount += 1;
      return [NORMALIZED_ROW];
    });
    const syncSymbols = createSyncSymbolsUseCase({ db: testDb, symbols: repo, adapter });

    const fakeApp = createFakeBootApp();
    registerBootSymbolSync(fakeApp, { symbols: repo, syncSymbols });
    await fakeApp.triggerListen();

    expect(callCount).toBe(1);
    const rows = await testDb.select().from(symbols);
    expect(rows).toHaveLength(1);
  });

  it('does not call the adapter on a second boot when the table is already populated', async () => {
    const repo = createSymbolsRepository(testDb);
    await testDb.transaction(async (tx) => {
      await repo.replaceAll(tx, [NORMALIZED_ROW]);
    });

    let called = false;
    const adapter = createFakeAdapter(async () => {
      called = true;
      return [NORMALIZED_ROW];
    });
    const syncSymbols = createSyncSymbolsUseCase({ db: testDb, symbols: repo, adapter });

    const fakeApp = createFakeBootApp();
    registerBootSymbolSync(fakeApp, { symbols: repo, syncSymbols });
    await fakeApp.triggerListen();

    expect(called).toBe(false);
    const rows = await testDb.select().from(symbols);
    expect(rows).toHaveLength(1);
  });

  it('swallows a failing exchange, logs the error, and leaves the empty table empty (does not block boot)', async () => {
    const repo = createSymbolsRepository(testDb);
    const adapter = createFakeAdapter(async () => {
      throw new ExchangeUnavailableError();
    });
    const syncSymbols = createSyncSymbolsUseCase({ db: testDb, symbols: repo, adapter });

    const fakeApp = createFakeBootApp();
    registerBootSymbolSync(fakeApp, { symbols: repo, syncSymbols });

    await expect(fakeApp.triggerListen()).resolves.toBeUndefined();
    expect(fakeApp.log.error).toHaveBeenCalledTimes(1);

    const rows = await testDb.select().from(symbols);
    expect(rows).toHaveLength(0);
  });

  it('a real server with a failing boot sync still reaches listening state and GET /health returns 200', async () => {
    const app = await buildAppInstance();
    const repo = createSymbolsRepository(testDb);
    const adapter = createFakeAdapter(async () => {
      throw new ExchangeUnavailableError();
    });
    const syncSymbols = createSyncSymbolsUseCase({ db: testDb, symbols: repo, adapter });
    registerBootSymbolSync(app, { symbols: repo, syncSymbols });

    await app.listen({ port: 0, host: '127.0.0.1' });

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);

    await app.close();
  });
});

describe('symbols HTTP routes', () => {
  let app: AppInstance;

  beforeAll(async () => {
    app = await buildAppInstance();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedUserAndLogin(remoteAddress: string): Promise<string> {
    const repo = createUserRepository(testDb);
    const passwordHash = await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id });
    await repo.upsertByEmail(SEED_EMAIL, passwordHash);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      remoteAddress,
      payload: { email: SEED_EMAIL, password: SEED_PASSWORD },
    });
    return res.json().data.accessToken as string;
  }

  it('GET /symbols requires authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/symbols' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /symbols honours the quote filter', async () => {
    const token = await seedUserAndLogin('203.0.113.20');
    const symbolsRepo = createSymbolsRepository(testDb);
    await testDb.transaction(async (tx) => {
      await symbolsRepo.replaceAll(tx, [
        NORMALIZED_ROW,
        { ...NORMALIZED_ROW, symbol: 'ETH/BUSD', base: 'ETH', quote: 'BUSD' },
      ]);
    });

    const res = await app.inject({
      method: 'GET',
      url: '/symbols?quote=BUSD',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.symbols).toHaveLength(1);
    expect(body.data.symbols[0].symbol).toBe('ETH/BUSD');
  });

  it('POST /symbols/sync calls the adapter even when the table is already populated (manual sync is never gated)', async () => {
    const token = await seedUserAndLogin('203.0.113.21');
    const symbolsRepo = createSymbolsRepository(testDb);
    await testDb.transaction(async (tx) => {
      await symbolsRepo.replaceAll(tx, [NORMALIZED_ROW]);
    });

    fetchMarketsImpl = async () => [
      {
        symbol: 'SOL/USDT',
        base: 'SOL',
        quote: 'USDT',
        active: true,
        spot: true,
        precision: { base: 8, quote: 2 },
        info: { filters: [] },
      },
    ];

    const res = await app.inject({
      method: 'POST',
      url: '/symbols/sync',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.count).toBe(1);

    const rows = await testDb.select().from(symbols);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.symbol).toBe('SOL/USDT');
  });

  it('POST /symbols/sync returns 503 when the adapter reports the exchange unavailable', async () => {
    const token = await seedUserAndLogin('203.0.113.22');
    const ccxt = (await import('ccxt')).default as unknown as { NetworkError: new (msg: string) => Error };

    fetchMarketsImpl = async () => {
      throw new ccxt.NetworkError('timeout');
    };

    const res = await app.inject({
      method: 'POST',
      url: '/symbols/sync',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(503);
  });
});
