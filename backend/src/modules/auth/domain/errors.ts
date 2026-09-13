import { DomainError } from '../../../shared/errors/domain-error.js';

export class InvalidCredentialsError extends DomainError {
  readonly statusCode = 401;

  readonly code = 'INVALID_CREDENTIALS';

  constructor() {
    super('Email ou senha incorretos.');
  }
}

export class TokenRevokedError extends DomainError {
  readonly statusCode = 401;

  readonly code = 'TOKEN_REVOKED';

  constructor() {
    super('Token revogado.');
  }
}

export class TokenExpiredError extends DomainError {
  readonly statusCode = 401;

  readonly code = 'TOKEN_EXPIRED';

  constructor() {
    super('Token expirado.');
  }
}
