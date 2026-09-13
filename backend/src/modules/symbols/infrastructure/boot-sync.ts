import type { FastifyBaseLogger } from 'fastify';
import type { SymbolsRepositoryPort } from '../domain/ports.js';

export interface BootSymbolSyncDeps {
  symbols: SymbolsRepositoryPort;
  syncSymbols: { execute(): Promise<{ count: number; lastSyncedAt: string }> };
}

export interface BootSymbolSyncApp {
  addHook(name: 'onListen', handler: () => Promise<void>): void;
  log: FastifyBaseLogger;
}

/**
 * Registers the automatic boot-time symbol sync. It only runs when the
 * symbols table is empty (D-14 — subsequent restarts must not re-sync), and
 * it is registered on the post-listen Fastify hook (`'onListen'` below),
 * never the earlier ready-lifecycle hook that blocks startup until it
 * resolves — a slow/failing Binance call there would prevent the server
 * from ever listening (D-16, RESEARCH.md Pitfall 5). `onListen` runs after
 * the server is already accepting connections, so a failure here is caught,
 * logged, and the server keeps serving requests.
 */
export function registerBootSymbolSync(app: BootSymbolSyncApp, deps: BootSymbolSyncDeps): void {
  app.addHook('onListen', async () => {
    try {
      const count = await deps.symbols.count();
      if (count === 0) {
        await deps.syncSymbols.execute();
        app.log.info('boot symbol sync completed — symbols table populated');
      }
    } catch (err) {
      app.log.error({ err }, 'boot symbol sync failed — continuing with existing/empty symbol table');
    }
  });
}
