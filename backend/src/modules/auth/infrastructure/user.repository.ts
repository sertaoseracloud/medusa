import { eq } from 'drizzle-orm';
import type { DrizzleDB } from '../../../persistence/db.js';
import { users } from '../../../persistence/schema/users.js';
import type { UserRepositoryPort } from '../domain/ports.js';
import type { UserRecord } from '../domain/user.entity.js';

export function createUserRepository(db: DrizzleDB): UserRepositoryPort {
  return {
    async findByEmail(email: string): Promise<UserRecord | null> {
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return row ?? null;
    },

    async findById(id: string): Promise<UserRecord | null> {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return row ?? null;
    },

    async upsertByEmail(email: string, passwordHash: string): Promise<UserRecord> {
      const [row] = await db
        .insert(users)
        .values({ email, passwordHash })
        .onConflictDoUpdate({
          target: users.email,
          set: { passwordHash, updatedAt: new Date() },
        })
        .returning();

      if (!row) {
        throw new Error('upsertByEmail failed to return a row');
      }

      return row;
    },

    async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
      await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, id));
    },
  };
}
