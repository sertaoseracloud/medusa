import { DomainError } from '../../../shared/errors/domain-error.js';

export class CredentialsNotConfiguredError extends DomainError {
  readonly statusCode = 404;

  readonly code = 'CREDENTIALS_NOT_CONFIGURED';

  constructor() {
    super('Nenhuma credencial de exchange configurada ainda.');
  }
}
