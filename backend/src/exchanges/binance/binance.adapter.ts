import ccxt from 'ccxt';
import type { IExchangeAdapter } from '../core/exchange-adapter.interface.js';
import type { DecryptedCredentials, NormalizedBalance, NormalizedSymbol } from '../core/types.js';
import {
  ExchangeAuthenticationError,
  ExchangePermissionError,
  ExchangeUnavailableError,
  ExchangeUnknownError,
} from '../core/errors.js';

// Fingerprint on BOTH accessKey and secretKey so a rotated secret (same
// accessKey, new secretKey — the normal Binance key-rotation flow) always
// misses the cache instead of silently reusing a client built from the old
// secret (CR-01). `dispose()` still exists to explicitly evict a specific
// credential pair (see save-credentials.use-case.ts, WR-01).
function fingerprint(creds: DecryptedCredentials): string {
  return `${creds.accessKey}:${creds.secretKey}`;
}

function mapExchangeError(err: unknown): Error {
  // PermissionDenied extends AuthenticationError in ccxt's hierarchy, so the more
  // specific check must run first or every PermissionDenied would be misclassified.
  if (err instanceof ccxt.PermissionDenied) return new ExchangePermissionError();
  if (err instanceof ccxt.AuthenticationError) return new ExchangeAuthenticationError();
  if (err instanceof ccxt.NetworkError) return new ExchangeUnavailableError();
  return new ExchangeUnknownError();
}

// ccxt's binance markets report precision in TICK_SIZE mode (a fractional step
// like 1e-8, 0.001, ...), not as a plain decimal-place count — inserting that
// float straight into an `integer` column fails ("invalid input syntax for
// type integer: 1e-8"). This converts either representation to an integer
// decimal-place count.
function toDecimalPlaces(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (Number.isInteger(n) && n >= 1) return n; // already a decimal-place count
  return Math.max(Math.round(-Math.log10(n)), 0); // tick-size step -> decimal places
}

function normalizeMarket(market: Record<string, any>): NormalizedSymbol {
  const filters: Array<Record<string, any>> = market.info?.filters ?? [];
  const minNotionalFilter = filters.find(
    (f) => f.filterType === 'MIN_NOTIONAL' || f.filterType === 'NOTIONAL',
  );
  const minLotSizeFilter = filters.find((f) => f.filterType === 'LOT_SIZE');

  return {
    symbol: market.symbol,
    base: market.base,
    quote: market.quote,
    basePrecision: toDecimalPlaces(market.precision?.base),
    quotePrecision: toDecimalPlaces(market.precision?.quote),
    minNotional: minNotionalFilter?.minNotional ?? null,
    minLotSize: minLotSizeFilter?.minQty ?? null,
  };
}

function normalizeBalance(raw: Record<string, any>): NormalizedBalance[] {
  const free: Record<string, number> = raw.free ?? {};
  const used: Record<string, number> = raw.used ?? {};
  const total: Record<string, number> = raw.total ?? {};
  const assets = new Set([...Object.keys(free), ...Object.keys(used), ...Object.keys(total)]);

  return Array.from(assets).map((asset) => ({
    asset,
    free: String(free[asset] ?? 0),
    locked: String(used[asset] ?? 0),
  }));
}

export class BinanceAdapter implements IExchangeAdapter {
  readonly id = 'binance';

  private readonly clients = new Map<string, InstanceType<typeof ccxt.binance>>();

  private publicClient: InstanceType<typeof ccxt.binance> | undefined;

  private getClient(creds: DecryptedCredentials): InstanceType<typeof ccxt.binance> {
    const key = fingerprint(creds);
    const existing = this.clients.get(key);
    if (existing) return existing;

    const client = new ccxt.binance({
      apiKey: creds.accessKey,
      secret: creds.secretKey,
      enableRateLimit: true,
    });
    this.clients.set(key, client);
    return client;
  }

  private getPublicClient(): InstanceType<typeof ccxt.binance> {
    if (!this.publicClient) {
      this.publicClient = new ccxt.binance({ enableRateLimit: true });
    }
    return this.publicClient;
  }

  dispose(creds: DecryptedCredentials): void {
    this.clients.delete(fingerprint(creds));
  }

  async testConnection(creds: DecryptedCredentials): Promise<void> {
    const client = this.getClient(creds);
    try {
      await client.fetchBalance();
    } catch (err) {
      throw mapExchangeError(err);
    }
  }

  async getBalance(creds: DecryptedCredentials): Promise<NormalizedBalance[]> {
    const client = this.getClient(creds);
    try {
      const raw = await client.fetchBalance();
      return normalizeBalance(raw as Record<string, any>);
    } catch (err) {
      throw mapExchangeError(err);
    }
  }

  async getSymbols(): Promise<NormalizedSymbol[]> {
    const client = this.getPublicClient();
    try {
      const markets = await client.fetchMarkets();
      return (markets as Array<Record<string, any>>)
        .filter((market) => market.active !== false && market.spot !== false)
        .map(normalizeMarket);
    } catch (err) {
      throw mapExchangeError(err);
    }
  }
}
