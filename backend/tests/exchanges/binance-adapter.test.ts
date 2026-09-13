import { describe, it, expect, vi, beforeEach } from 'vitest';
import ccxt from 'ccxt';
import {
  ExchangeAuthenticationError,
  ExchangePermissionError,
  ExchangeUnavailableError,
  ExchangeUnknownError,
} from '../../src/exchanges/core/errors.js';

let constructorCallCount = 0;
let fetchBalanceImpl: () => Promise<unknown> = async () => ({ free: {}, used: {}, total: {} });
let fetchMarketsImpl: () => Promise<unknown> = async () => [];

vi.mock('ccxt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ccxt')>();
  const actualDefault = actual.default as Record<string, unknown>;

  class MockBinance {
    constructor() {
      constructorCallCount += 1;
    }

    fetchBalance() {
      return fetchBalanceImpl();
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

const { BinanceAdapter } = await import('../../src/exchanges/binance/binance.adapter.js');

const CREDS = { accessKey: 'access-key', secretKey: 'secret-key' };

describe('BinanceAdapter error mapping', () => {
  beforeEach(() => {
    constructorCallCount = 0;
    fetchBalanceImpl = async () => ({ free: {}, used: {}, total: {} });
    fetchMarketsImpl = async () => [];
  });

  it('maps ccxt.AuthenticationError to ExchangeAuthenticationError', async () => {
    fetchBalanceImpl = async () => {
      throw new ccxt.AuthenticationError('bad key');
    };
    const adapter = new BinanceAdapter();
    await expect(adapter.testConnection(CREDS)).rejects.toBeInstanceOf(ExchangeAuthenticationError);
  });

  it('maps ccxt.PermissionDenied to ExchangePermissionError', async () => {
    fetchBalanceImpl = async () => {
      throw new ccxt.PermissionDenied('no permission');
    };
    const adapter = new BinanceAdapter();
    await expect(adapter.testConnection(CREDS)).rejects.toBeInstanceOf(ExchangePermissionError);
  });

  it('maps ccxt.NetworkError to ExchangeUnavailableError', async () => {
    fetchBalanceImpl = async () => {
      throw new ccxt.NetworkError('timeout');
    };
    const adapter = new BinanceAdapter();
    await expect(adapter.testConnection(CREDS)).rejects.toBeInstanceOf(ExchangeUnavailableError);
  });

  it('maps a plain Error to ExchangeUnknownError', async () => {
    fetchBalanceImpl = async () => {
      throw new Error('something else');
    };
    const adapter = new BinanceAdapter();
    await expect(adapter.testConnection(CREDS)).rejects.toBeInstanceOf(ExchangeUnknownError);
  });

  it('produces four errors with distinct codes and messages', () => {
    const authErr = new ExchangeAuthenticationError();
    const permErr = new ExchangePermissionError();
    const unavailErr = new ExchangeUnavailableError();
    const unknownErr = new ExchangeUnknownError();

    const codes = [authErr.code, permErr.code, unavailErr.code, unknownErr.code];
    const messages = [authErr.message, permErr.message, unavailErr.message, unknownErr.message];

    expect(new Set(codes).size).toBe(4);
    expect(new Set(messages).size).toBe(4);
  });
});

describe('BinanceAdapter.getSymbols', () => {
  beforeEach(() => {
    constructorCallCount = 0;
    fetchBalanceImpl = async () => ({ free: {}, used: {}, total: {} });
    fetchMarketsImpl = async () => [];
  });

  it('normalizes active spot markets and filters out inactive/non-spot ones', async () => {
    fetchMarketsImpl = async () => [
      {
        symbol: 'BTC/USDT',
        base: 'BTC',
        quote: 'USDT',
        active: true,
        spot: true,
        precision: { base: 8, quote: 2 },
        info: {
          filters: [
            { filterType: 'MIN_NOTIONAL', minNotional: '10.00000000' },
            { filterType: 'LOT_SIZE', minQty: '0.00001000' },
          ],
        },
      },
      {
        symbol: 'ETH/USDT',
        base: 'ETH',
        quote: 'USDT',
        active: false,
        spot: true,
        precision: { base: 8, quote: 2 },
        info: { filters: [] },
      },
      {
        symbol: 'BTC/USDT:USDT',
        base: 'BTC',
        quote: 'USDT',
        active: true,
        spot: false,
        precision: { base: 8, quote: 2 },
        info: { filters: [] },
      },
    ];

    const adapter = new BinanceAdapter();
    const symbols = await adapter.getSymbols();

    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toEqual({
      symbol: 'BTC/USDT',
      base: 'BTC',
      quote: 'USDT',
      basePrecision: 8,
      quotePrecision: 2,
      minNotional: '10.00000000',
      minLotSize: '0.00001000',
    });
  });
});

describe('BinanceAdapter memoization', () => {
  beforeEach(() => {
    constructorCallCount = 0;
    fetchBalanceImpl = async () => ({ free: {}, used: {}, total: {} });
    fetchMarketsImpl = async () => [];
  });

  it('constructs the ccxt client only once across two testConnection calls with the same credentials', async () => {
    const adapter = new BinanceAdapter();
    await adapter.testConnection(CREDS);
    await adapter.testConnection(CREDS);

    expect(constructorCallCount).toBe(1);
  });

  // CR-01 regression: same accessKey, rotated secretKey must NOT reuse the
  // stale client — the cache key must include secretKey, not just accessKey.
  it('constructs a new ccxt client when the accessKey is unchanged but the secretKey is rotated', async () => {
    const adapter = new BinanceAdapter();
    await adapter.testConnection(CREDS);
    await adapter.testConnection({ accessKey: CREDS.accessKey, secretKey: 'rotated-secret-key' });

    expect(constructorCallCount).toBe(2);
  });

  it('dispose() evicts the cached client so a subsequent call with the same credentials rebuilds it', async () => {
    const adapter = new BinanceAdapter();
    await adapter.testConnection(CREDS);
    adapter.dispose(CREDS);
    await adapter.testConnection(CREDS);

    expect(constructorCallCount).toBe(2);
  });
});
