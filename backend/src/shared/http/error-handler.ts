import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { DomainError } from '../errors/domain-error.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerErrorHandler(app: FastifyInstance<any, any, any, any, any>): void {
  app.setErrorHandler((err: unknown, req: FastifyRequest, reply: FastifyReply) => {
    const timestamp = new Date().toISOString();

    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({
        data: {
          fields: err.validation.map((v) => ({
            field: v.instancePath.replace(/^\//, ''),
            message: v.message,
          })),
        },
        message: 'Validation failed',
        timestamp,
      });
    }

    if (err instanceof DomainError) {
      return reply.status(err.statusCode).send({
        data: null,
        message: err.message,
        timestamp,
      });
    }

    const maybeStatusCode = (err as { statusCode?: number })?.statusCode;
    if (maybeStatusCode === 429) {
      return reply.status(429).send({
        data: null,
        message: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',
        timestamp,
      });
    }

    req.log.error(err);
    return reply.status(500).send({
      data: null,
      message: 'Internal server error',
      timestamp,
    });
  });
}
