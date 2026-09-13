import argon2 from 'argon2';
import type { UserRepositoryPort } from '../domain/ports.js';

interface SeedLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}

export interface SeedOperatorUserDeps {
  users: UserRepositoryPort;
  env: NodeJS.ProcessEnv;
  log: SeedLogger;
}

export async function seedOperatorUser(deps: SeedOperatorUserDeps): Promise<void> {
  const { users, env, log } = deps;
  const email = env.SEED_USER_EMAIL;
  const password = env.SEED_USER_PASSWORD;

  if (!email || !password) {
    if (env.NODE_ENV === 'production') {
      throw new Error('SEED_USER_EMAIL and SEED_USER_PASSWORD are required in production — refusing to start.');
    }
    log.warn(
      {},
      '[seed-user] SEED_USER_EMAIL/SEED_USER_PASSWORD not set — skipping operator user seed in development.',
    );
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await users.upsertByEmail(email, passwordHash);
  log.info({ email }, '[seed-user] operator user synced');
}
