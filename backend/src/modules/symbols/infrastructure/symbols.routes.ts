import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createSymbolsRepository } from './symbols.repository.js';
import { listSymbolsQuerySchema } from './symbols.schemas.js';
import { createListSymbolsUseCase } from '../application/list-symbols.use-case.js';
import { createSyncSymbolsUseCase } from '../application/sync-symbols.use-case.js';
import { getExchangeAdapter, DEFAULT_EXCHANGE_ID } from '../../../exchanges/core/exchange-registry.js';
import { ok } from '../../../shared/http/response-envelope.js';
import { authenticate } from '../../../shared/http/authenticate.js';

export const symbolsRoutes: FastifyPluginAsync = async (app) => {
  const symbols = createSymbolsRepository(app.db);
  const adapter = getExchangeAdapter(DEFAULT_EXCHANGE_ID);
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/symbols',
    {
      schema: { querystring: listSymbolsQuerySchema },
      preHandler: [authenticate],
    },
    async (request) => {
      const listSymbolsUseCase = createListSymbolsUseCase({ symbols });
      const result = await listSymbolsUseCase.execute({
        quote: request.query.quote,
        search: request.query.search,
      });
      return ok(result);
    },
  );

  // No empty-table gate here — the manual sync button always forces a
  // refresh (D-13). The gate only applies to the automatic boot trigger
  // (see boot-sync.ts).
  typedApp.post(
    '/symbols/sync',
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async () => {
      const syncSymbolsUseCase = createSyncSymbolsUseCase({ db: app.db, symbols, adapter });
      const result = await syncSymbolsUseCase.execute();
      return ok(result);
    },
  );
};
