import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createSettingsRepository } from './settings.repository.js';
import { saveCredentialsBodySchema } from './settings.schemas.js';
import { createGetSettingsUseCase } from '../application/get-settings.use-case.js';
import { createSaveCredentialsUseCase } from '../application/save-credentials.use-case.js';
import { getExchangeAdapter, DEFAULT_EXCHANGE_ID } from '../../../exchanges/core/exchange-registry.js';
import { ok } from '../../../shared/http/response-envelope.js';
import { authenticate } from '../../../shared/http/authenticate.js';

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  const settings = createSettingsRepository(app.db);
  const adapter = getExchangeAdapter(DEFAULT_EXCHANGE_ID);
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/settings/credentials',
    { preHandler: [authenticate] },
    async (request) => {
      const getSettingsUseCase = createGetSettingsUseCase({
        settings,
        masterKey: app.secrets.AES_KEY,
      });
      const result = await getSettingsUseCase.execute(request.user.sub);
      return ok(result);
    },
  );

  typedApp.put(
    '/settings/credentials',
    {
      schema: { body: saveCredentialsBodySchema },
      preHandler: [authenticate],
    },
    async (request) => {
      const saveCredentialsUseCase = createSaveCredentialsUseCase({
        settings,
        adapter,
        masterKey: app.secrets.AES_KEY,
      });
      const result = await saveCredentialsUseCase.execute({
        userId: request.user.sub,
        accessKey: request.body.accessKey,
        secretKey: request.body.secretKey,
      });
      return ok(result);
    },
  );
};
