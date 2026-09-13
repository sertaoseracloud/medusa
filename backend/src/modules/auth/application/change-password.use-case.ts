import argon2 from 'argon2';
import type { UserRepositoryPort, RefreshTokenRepositoryPort } from '../domain/ports.js';
import { InvalidCredentialsError } from '../domain/errors.js';

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordUseCaseDeps {
  users: UserRepositoryPort;
  refreshTokens: RefreshTokenRepositoryPort;
}

export function createChangePasswordUseCase(deps: ChangePasswordUseCaseDeps) {
  const { users, refreshTokens } = deps;

  return {
    async execute(input: ChangePasswordInput): Promise<void> {
      const { userId, currentPassword, newPassword } = input;

      const user = await users.findById(userId);
      if (!user) {
        throw new InvalidCredentialsError();
      }

      const isValid = await argon2.verify(user.passwordHash, currentPassword);
      if (!isValid) {
        throw new InvalidCredentialsError();
      }

      const newPasswordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
      await users.updatePasswordHash(userId, newPasswordHash);

      // The operator password is re-synced from SEED_USER_PASSWORD on every
      // boot (D-03) — this change only survives until the next server
      // restart unless the environment variable is updated too. Every
      // existing session must die with the password change regardless.
      await refreshTokens.revokeAllForUser(userId);
    },
  };
}
