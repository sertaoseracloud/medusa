import type { NormalizedSymbol } from '../../../exchanges/core/types.js';
import type { DrizzleDB } from '../../../persistence/db.js';
import type { SymbolRecord } from './symbol.entity.js';

export type DrizzleTx = Parameters<Parameters<DrizzleDB['transaction']>[0]>[0];

export interface SymbolsFilter {
  quote?: string;
  search?: string;
}

export interface SymbolsRepositoryPort {
  count(): Promise<number>;
  list(filter?: SymbolsFilter): Promise<SymbolRecord[]>;
  lastSyncedAt(): Promise<Date | null>;
  replaceAll(tx: DrizzleTx, rows: NormalizedSymbol[]): Promise<void>;
}
