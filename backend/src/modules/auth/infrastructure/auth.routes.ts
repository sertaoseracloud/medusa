import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createUserRepository } from './user.repository.js';
import { createRefreshTokenRepository } from './refresh-token.repository.js';
import { createLoginUseCase } from '../application/login.use-case.js';
import { loginBodySchema } from './auth.schemas.js';
import { ok } from '../../../shared/http/response-envelope.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  const users = createUserRepository(app.db);
  const refreshTokens = createRefreshTokenRepository(app.db);
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/auth/login',
    {
      schema: { body: loginBodySchema },
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      const loginUseCase = createLoginUseCase({
        users,
        refreshTokens,
        signAccessToken: (payload) => reply.jwtSign(payload),
      });

      const result = await loginUseCase.execute(request.body);
      return ok(result);
    },
  );
};
