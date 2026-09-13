import { DomainError } from '../../shared/errors/domain-error.js';

export class ExchangeAuthenticationError extends DomainError {
  readonly statusCode = 400;

  readonly code = 'EXCHANGE_AUTH';

  constructor() {
    super(
      'Chave ou segredo inválidos. Verifique as credenciais geradas no painel da Binance e tente novamente.',
    );
  }
}

export class ExchangePermissionError extends DomainError {
  readonly statusCode = 400;

  readonly code = 'EXCHANGE_PERMISSION';

  constructor() {
    super(
      'As credenciais são válidas, mas não têm permissão de leitura de saldo. Habilite essa permissão no painel da Binance.',
    );
  }
}

export class ExchangeUnavailableError extends DomainError {
  readonly statusCode = 503;

  readonly code = 'EXCHANGE_UNAVAILABLE';

  constructor() {
    super(
      'Não foi possível conectar à Binance agora (timeout ou serviço indisponível). Tente novamente em alguns instantes.',
    );
  }
}

export class ExchangeUnknownError extends DomainError {
  readonly statusCode = 502;

  readonly code = 'EXCHANGE_UNKNOWN';

  constructor() {
    super('Ocorreu um erro inesperado ao se comunicar com a exchange. Tente novamente mais tarde.');
  }
}
