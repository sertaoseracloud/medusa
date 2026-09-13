import type { FastifyRequest, FastifyReply } from 'fastify';
import { InvalidCredentialsError, TokenExpiredError } from '../../modules/auth/domain/errors.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

interface JwtVerifyError {
  code?: string;
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (err) {
    const code = (err as JwtVerifyError)?.code;

    if (code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
      throw new TokenExpiredError();
    }

    // FST_JWT_NO_AUTHORIZATION_IN_HEADER, FST_JWT_AUTHORIZATION_TOKEN_INVALID,
    // FST_JWT_BAD_REQUEST, and any other verification failure all surface as 401
    // through the standard InvalidCredentialsError rather than crashing the server.
    throw new InvalidCredentialsError();
  }
}
