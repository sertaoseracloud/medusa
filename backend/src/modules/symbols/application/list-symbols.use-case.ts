import type { SymbolsFilter, SymbolsRepositoryPort } from '../domain/ports.js';
import type { SymbolRecord } from '../domain/symbol.entity.js';

export interface ListSymbolsResult {
  symbols: SymbolRecord[];
  count: number;
  lastSyncedAt: string | null;
}

export function createListSymbolsUseCase(deps: { symbols: SymbolsRepositoryPort }): {
  execute(filter?: SymbolsFilter): Promise<ListSymbolsResult>;
} {
  return {
    async execute(filter: SymbolsFilter = {}): Promise<ListSymbolsResult> {
      const [rows, lastSyncedAt] = await Promise.all([
        deps.symbols.list(filter),
        deps.symbols.lastSyncedAt(),
      ]);

      return {
        symbols: rows,
        count: rows.length,
        lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
      };
    },
  };
}
