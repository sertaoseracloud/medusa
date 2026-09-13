import type { SettingsRecord } from './exchange-credentials.entity.js';

export interface SettingsRepositoryPort {
  findByUserId(userId: string): Promise<SettingsRecord | null>;
  upsertCredentials(
    userId: string,
    sealedAccessKey: string,
    sealedSecretKey: string,
    keyVersion: string,
  ): Promise<void>;
}
