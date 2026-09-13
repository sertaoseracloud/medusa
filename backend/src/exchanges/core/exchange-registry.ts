import type { IExchangeAdapter } from './exchange-adapter.interface.js';
import { BinanceAdapter } from '../binance/binance.adapter.js';

export const DEFAULT_EXCHANGE_ID = 'binance';

const binanceAdapter = new BinanceAdapter();

const registry: Record<string, IExchangeAdapter> = {
  binance: binanceAdapter,
};

export function getExchangeAdapter(id: string): IExchangeAdapter {
  const adapter = registry[id];
  if (!adapter) {
    throw new Error(`Unknown exchange adapter id: ${id}`);
  }
  return adapter;
}
