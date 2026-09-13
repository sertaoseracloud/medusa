import type { RefreshTokenRepositoryPort } from '../domain/ports.js';
import { hashRefreshToken } from '../infrastructure/jwt.js';

export interface LogoutInput {
  userId: string;
  refreshToken: string;
}

export interface LogoutUseCaseDeps {
  refreshTokens: RefreshTokenRepositoryPort;
}

// No in-memory array anywhere in this module — the legacy blacklist was a
// plain JS array nothing ever read on the refresh path, which made "logout"
// a complete no-op. Revocation here is persisted and enforced by
// refresh.use-case.ts's findActive/isValid check on every subsequent call.
export function createLogoutUseCase(deps: LogoutUseCaseDeps) {
  const { refreshTokens } = deps;

  return {
    async execute(input: LogoutInput): Promise<void> {
      const { userId, refreshToken } = input;
      const tokenHash = hashRefreshToken(refreshToken);

      const active = await refreshTokens.findActive(tokenHash);

      // A token belonging to nobody, or to someone else, is treated exactly
      // like an already-revoked token — success either way, without
      // disclosing which case it was.
      if (active && active.userId === userId) {
        await refreshTokens.revoke(tokenHash);
      }
    },
  };
}
