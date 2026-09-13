import { and, eq, isNull } from 'drizzle-orm';
import type { DrizzleDB } from '../../../persistence/db.js';
import { refreshTokens } from '../../../persistence/schema/refresh-tokens.js';
import type { RefreshTokenRepositoryPort } from '../domain/ports.js';

export function createRefreshTokenRepository(db: DrizzleDB): RefreshTokenRepositoryPort {
  return {
    async insert(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
      await db.insert(refreshTokens).values({ userId, tokenHash, expiresAt });
    },

    async isValid(tokenHash: string): Promise<boolean> {
      const [row] = await db
        .select()
        .from(refreshTokens)
        .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
        .limit(1);

      return !!row && row.expiresAt > new Date();
    },

    async findActive(tokenHash: string): Promise<{ id: string; userId: string } | null> {
      const [row] = await db
        .select()
        .from(refreshTokens)
        .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
        .limit(1);

      if (!row || row.expiresAt <= new Date()) return null;

      return { id: row.id, userId: row.userId };
    },

    async revoke(tokenHash: string): Promise<void> {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.tokenHash, tokenHash));
    },

    async revokeAllForUser(userId: string): Promise<void> {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    },
  };
}
