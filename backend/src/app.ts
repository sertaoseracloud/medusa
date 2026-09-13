import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import { logger } from './shared/logging.js';
import { registerErrorHandler } from './shared/http/error-handler.js';
import { ok } from './shared/http/response-envelope.js';
import type { DrizzleDB } from './persistence/db.js';
import type { AppSecrets } from './security/secrets.js';
import { authRoutes } from './modules/auth/infrastructure/auth.routes.js';
import { ACCESS_TOKEN_TTL } from './modules/auth/infrastructure/jwt.js';
import { settingsRoutes } from './modules/settings/infrastructure/settings.routes.js';
import { symbolsRoutes } from './modules/symbols/infrastructure/symbols.routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: DrizzleDB;
    secrets: AppSecrets;
  }
}

export interface BuildAppDeps {
  db: DrizzleDB;
  secrets: AppSecrets;
}

function createBaseApp() {
  return fastify({ loggerInstance: logger }).withTypeProvider<ZodTypeProvider>();
}

export type AppInstance = ReturnType<typeof createBaseApp>;

export async function buildApp(deps: BuildAppDeps): Promise<AppInstance> {
  const app = createBaseApp();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet);

  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(jwt, {
    secret: deps.secrets.JWT_SECRET,
    sign: { expiresIn: ACCESS_TOKEN_TTL },
  });

  registerErrorHandler(app);

  app.decorate('db', deps.db);
  app.decorate('secrets', deps.secrets);

  await app.register(authRoutes);
  await app.register(settingsRoutes);
  await app.register(symbolsRoutes);

  app.get('/health', async () => ok({ status: 'ok' }));

  if (process.env.NODE_ENV !== 'production') {
    app.post(
      '/health/echo',
      {
        schema: {
          body: z.object({
            email: z.string().email(),
            amount: z.number().int().positive(),
          }),
        },
      },
      async (request) => ok(request.body),
    );
  }

  return app;
}
