import type { IExchangeAdapter } from '../../../exchanges/core/exchange-adapter.interface.js';
import type { DecryptedCredentials } from '../../../exchanges/core/types.js';
import { sealCredential, openCredential } from '../../../security/credential-vault.js';
import type { SettingsRepositoryPort } from '../domain/ports.js';
import { toSettingsDto, type SettingsDto } from '../infrastructure/settings.dto.js';

const KEY_VERSION = 'v1';

export interface SaveCredentialsDeps {
  settings: SettingsRepositoryPort;
  adapter: IExchangeAdapter;
  masterKey: Buffer;
}

export interface SaveCredentialsInput {
  userId: string;
  accessKey: string;
  secretKey: string;
}

export function createSaveCredentialsUseCase(deps: SaveCredentialsDeps): {
  execute(input: SaveCredentialsInput): Promise<SettingsDto>;
} {
  return {
    async execute(input: SaveCredentialsInput): Promise<SettingsDto> {
      // D-06: the exchange must accept these credentials BEFORE anything is
      // persisted. If this rejects, the domain error (ExchangeAuthenticationError /
      // ExchangePermissionError / ExchangeUnavailableError / ExchangeUnknownError)
      // propagates unchanged to the caller — no repository write ever happens
      // on a failed test, and no generic error is substituted (D-07).
      await deps.adapter.testConnection({
        accessKey: input.accessKey,
        secretKey: input.secretKey,
      });

      const sealedAccessKey = sealCredential(input.accessKey, deps.masterKey);
      const sealedSecretKey = sealCredential(input.secretKey, deps.masterKey);

      await deps.settings.upsertCredentials(
        input.userId,
        sealedAccessKey,
        sealedSecretKey,
        KEY_VERSION,
      );

      const record = await deps.settings.findByUserId(input.userId);
      return toSettingsDto(record, deps.masterKey);
    },
  };
}

export interface ResolveCredentialsDeps {
  settings: SettingsRepositoryPort;
  masterKey: Buffer;
}

/**
 * Opens the sealed credentials for in-process use only. This function's
 * return value must never be handed to a serializer/controller — it is
 * consumed by Plan 08 (balance/market-data fetching), never by an HTTP
 * response path.
 */
export function createResolveCredentials(
  deps: ResolveCredentialsDeps,
): (userId: string) => Promise<DecryptedCredentials | null> {
  return async (userId: string): Promise<DecryptedCredentials | null> => {
    const record = await deps.settings.findByUserId(userId);
    if (!record) return null;

    return {
      accessKey: openCredential(record.encryptedAccessKey, deps.masterKey),
      secretKey: openCredential(record.encryptedSecretKey, deps.masterKey),
    };
  };
}
