import type { UserRecord } from './user.entity.js';

export interface UserRepositoryPort {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  upsertByEmail(email: string, passwordHash: string): Promise<UserRecord>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
}

export interface RefreshTokenRepositoryPort {
  insert(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  isValid(tokenHash: string): Promise<boolean>;
  findActive(tokenHash: string): Promise<{ id: string; userId: string } | null>;
  revoke(tokenHash: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}
