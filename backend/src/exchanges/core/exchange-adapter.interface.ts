import type { DecryptedCredentials, NormalizedBalance, NormalizedSymbol } from './types.js';

export interface IExchangeAdapter {
  readonly id: string;
  testConnection(creds: DecryptedCredentials): Promise<void>;
  getBalance(creds: DecryptedCredentials): Promise<NormalizedBalance[]>;
  getSymbols(): Promise<NormalizedSymbol[]>;
  /**
   * Evicts any cached exchange client for this credential pair. Callers
   * (e.g. save-credentials.use-case.ts) must invoke this for the PREVIOUS
   * credential pair whenever it is superseded by a new one, so stale
   * clients built from rotated/removed secrets don't leak for the
   * lifetime of the process (see CR-01/WR-01).
   */
  dispose(creds: DecryptedCredentials): void;
}
