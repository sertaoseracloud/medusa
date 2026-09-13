import { eq } from 'drizzle-orm';
import type { DrizzleDB } from '../../../persistence/db.js';
import { settings } from '../../../persistence/schema/settings.js';
import type { SettingsRepositoryPort } from '../domain/ports.js';
import type { SettingsRecord } from '../domain/exchange-credentials.entity.js';

export function createSettingsRepository(db: DrizzleDB): SettingsRepositoryPort {
  return {
    async findByUserId(userId: string): Promise<SettingsRecord | null> {
      const [row] = await db.select().from(settings).where(eq(settings.userId, userId)).limit(1);
      return row ?? null;
    },

    async upsertCredentials(
      userId: string,
      sealedAccessKey: string,
      sealedSecretKey: string,
      keyVersion: string,
    ): Promise<void> {
      await db
        .insert(settings)
        .values({
          userId,
          encryptedAccessKey: sealedAccessKey,
          encryptedSecretKey: sealedSecretKey,
          keyVersion,
        })
        .onConflictDoUpdate({
          target: settings.userId,
          set: {
            encryptedAccessKey: sealedAccessKey,
            encryptedSecretKey: sealedSecretKey,
            keyVersion,
            updatedAt: new Date(),
          },
        });
    },
  };
}
