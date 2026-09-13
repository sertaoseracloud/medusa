import { openCredential, maskSecret } from '../../../security/credential-vault.js';
import type { SettingsRecord } from '../domain/exchange-credentials.entity.js';

export interface SettingsDto {
  exchangeId: 'binance';
  configured: boolean;
  accessKeyMasked: string | null;
  secretKeyMasked: string | null;
  updatedAt: string | null;
}

/**
 * The single serialization boundary that turns a SettingsRecord into a
 * response payload. No controller may hand-pick fields off the record —
 * everything that leaves the process for this module goes through here,
 * and the secret is opened only long enough to mask it (D-05).
 */
export function toSettingsDto(record: SettingsRecord | null, masterKey: Buffer): SettingsDto {
  if (!record) {
    return {
      exchangeId: 'binance',
      configured: false,
      accessKeyMasked: null,
      secretKeyMasked: null,
      updatedAt: null,
    };
  }

  const accessKey = openCredential(record.encryptedAccessKey, masterKey);
  const secretKey = openCredential(record.encryptedSecretKey, masterKey);

  return {
    exchangeId: 'binance',
    configured: true,
    accessKeyMasked: maskSecret(accessKey),
    secretKeyMasked: maskSecret(secretKey),
    updatedAt: record.updatedAt.toISOString(),
  };
}
