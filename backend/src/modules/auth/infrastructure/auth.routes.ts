import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createUserRepository } from './user.repository.js';
import { createRefreshTokenRepository } from './refresh-token.repository.js';
import { createLoginUseCase } from '../application/login.use-case.js';
import { createRefreshUseCase } from '../application/refresh.use-case.js';
import { createLogoutUseCase } from '../application/logout.use-case.js';
import { createChangePasswordUseCase } from '../application/change-password.use-case.js';
import {
  loginBodySchema,
  refreshBodySchema,
  logoutBodySchema,
  changePasswordBodySchema,
} from './auth.schemas.js';
import { ok } from '../../../shared/http/response-envelope.js';
import { authenticate } from '../../../shared/http/authenticate.js';
import { InvalidCredentialsError } from '../domain/errors.js';

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

  app.get(
    '/auth/me',
    { preHandler: [authenticate] },
    async (request) => {
      const user = await users.findById(request.user.sub);
      if (!user) {
        throw new InvalidCredentialsError();
      }
      return ok({ id: user.id, email: user.email });
    },
  );

  typedApp.post(
    '/auth/refresh',
    {
      schema: { body: refreshBodySchema },
      config: { rateLimit: { max: 30, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      const refreshUseCase = createRefreshUseCase({
        db: app.db,
        refreshTokens,
        signAccessToken: (payload) => reply.jwtSign(payload),
      });

      const result = await refreshUseCase.execute(request.body);
      return ok(result);
    },
  );

  typedApp.post(
    '/auth/logout',
    {
      schema: { body: logoutBodySchema },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const logoutUseCase = createLogoutUseCase({ refreshTokens });
      await logoutUseCase.execute({
        userId: request.user.sub,
        refreshToken: request.body.refreshToken,
      });
      return reply.status(204).send();
    },
  );

  // The operator password is re-synced from SEED_USER_PASSWORD on every
  // server boot (D-03) — a successful change here only survives until the
  // next restart unless the environment variable is updated too.
  typedApp.patch(
    '/auth/password',
    {
      schema: { body: changePasswordBodySchema },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const changePasswordUseCase = createChangePasswordUseCase({ users, refreshTokens });
      await changePasswordUseCase.execute({
        userId: request.user.sub,
        currentPassword: request.body.currentPassword,
        newPassword: request.body.newPassword,
      });
      return reply.status(204).send();
    },
  );
};
