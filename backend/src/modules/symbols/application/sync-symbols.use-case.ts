import type { DrizzleDB } from '../../../persistence/db.js';
import type { IExchangeAdapter } from '../../../exchanges/core/exchange-adapter.interface.js';
import { ExchangeUnknownError } from '../../../exchanges/core/errors.js';
import type { SymbolsRepositoryPort } from '../domain/ports.js';

export interface SyncSymbolsDeps {
  db: DrizzleDB;
  symbols: SymbolsRepositoryPort;
  adapter: IExchangeAdapter;
}

export interface SyncSymbolsResult {
  count: number;
  lastSyncedAt: string;
}

export function createSyncSymbolsUseCase(deps: SyncSymbolsDeps): {
  execute(): Promise<SyncSymbolsResult>;
} {
  return {
    async execute(): Promise<SyncSymbolsResult> {
      // Fetch first, write second: a slow network call must not hold a DB
      // transaction open (D-15). If this rejects, the exchange domain error
      // propagates and nothing is written.
      const normalized = await deps.adapter.getSymbols();

      // Refuse to write an empty result — a degraded upstream response must
      // never silently wipe the previously synced symbol table.
      if (normalized.length === 0) {
        throw new ExchangeUnknownError();
      }

      await deps.db.transaction(async (tx) => {
        await deps.symbols.replaceAll(tx, normalized);
      });

      const lastSyncedAt = await deps.symbols.lastSyncedAt();

      return {
        count: normalized.length,
        lastSyncedAt: (lastSyncedAt ?? new Date()).toISOString(),
      };
    },
  };
}
