import type { DecryptedCredentials, NormalizedBalance, NormalizedSymbol } from './types.js';

export interface IExchangeAdapter {
  readonly id: string;
  testConnection(creds: DecryptedCredentials): Promise<void>;
  getBalance(creds: DecryptedCredentials): Promise<NormalizedBalance[]>;
  getSymbols(): Promise<NormalizedSymbol[]>;
}
