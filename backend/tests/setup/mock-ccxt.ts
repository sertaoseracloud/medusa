import ccxt from 'ccxt';

export const AuthenticationError = ccxt.AuthenticationError;
export const PermissionDenied = ccxt.PermissionDenied;
export const NetworkError = ccxt.NetworkError;

export interface MockBinanceOverrides {
  fetchBalance?: () => Promise<unknown>;
  fetchMarkets?: () => Promise<unknown>;
}

export function createMockBinance(overrides: MockBinanceOverrides = {}) {
  return {
    fetchBalance: overrides.fetchBalance ?? (async () => ({ info: {}, free: {}, used: {}, total: {} })),
    fetchMarkets: overrides.fetchMarkets ?? (async () => []),
  };
}
