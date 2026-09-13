import { eq } from 'drizzle-orm';
import type { DrizzleDB } from '../../../persistence/db.js';
import { refreshTokens as refreshTokensTable } from '../../../persistence/schema/refresh-tokens.js';
import type { RefreshTokenRepositoryPort } from '../domain/ports.js';
import { TokenRevokedError } from '../domain/errors.js';
import {
  REFRESH_TOKEN_TTL_DAYS,
  generateRefreshToken,
  hashRefreshToken,
} from '../infrastructure/jwt.js';

export interface RefreshInput {
  refreshToken: string;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface RefreshUseCaseDeps {
  db: DrizzleDB;
  refreshTokens: RefreshTokenRepositoryPort;
  signAccessToken: (payload: { sub: string }) => Promise<string> | string;
}

export function createRefreshUseCase(deps: RefreshUseCaseDeps) {
  const { db, refreshTokens, signAccessToken } = deps;

  return {
    async execute(input: RefreshInput): Promise<RefreshResult> {
      const tokenHash = hashRefreshToken(input.refreshToken);

      const active = await refreshTokens.findActive(tokenHash);
      const valid = active ? await refreshTokens.isValid(tokenHash) : false;

      if (!active || !valid) {
        // Never fall through to issuing a token here — the legacy in-memory
        // blacklist defect skipped this check on every path except the exact
        // one it was supposed to guard, so validity is re-checked on every
        // single refresh call rather than only at issuance time.
        throw new TokenRevokedError();
      }

      const newRawRefreshToken = generateRefreshToken();
      const newTokenHash = hashRefreshToken(newRawRefreshToken);
      const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

      // Rotate inside a single transaction so a mid-flight crash can never
      // leave the operator with two live refresh tokens, or none at all.
      await db.transaction(async (tx) => {
        await tx.insert(refreshTokensTable).values({
          userId: active.userId,
          tokenHash: newTokenHash,
          expiresAt: newExpiresAt,
        });

        await tx
          .update(refreshTokensTable)
          .set({ revokedAt: new Date() })
          .where(eq(refreshTokensTable.tokenHash, tokenHash));
      });

      const accessToken = await signAccessToken({ sub: active.userId });

      return {
        accessToken,
        refreshToken: newRawRefreshToken,
        tokenType: 'Bearer',
        expiresIn: 900,
      };
    },
  };
}
