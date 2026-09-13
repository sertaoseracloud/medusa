import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp, type AppInstance } from '../../src/app.js';
import { testDb } from '../setup/db.js';
import { refreshTokens } from '../../src/persistence/schema/refresh-tokens.js';
import { createUserRepository } from '../../src/modules/auth/infrastructure/user.repository.js';
import { hashRefreshToken } from '../../src/modules/auth/infrastructure/jwt.js';
import argon2 from 'argon2';

const SEED_EMAIL = 'seed-login-test@example.com';
const SEED_PASSWORD = 'correct-horse-battery-staple';

let app: AppInstance;

beforeAll(async () => {
  app = await buildApp({
    db: testDb,
    secrets: { JWT_SECRET: 'test-secret', AES_KEY: Buffer.alloc(32, 1) },
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

async function seedUser(): Promise<void> {
  const repo = createUserRepository(testDb);
  const passwordHash = await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id });
  await repo.upsertByEmail(SEED_EMAIL, passwordHash);
}

describe('POST /auth/login', () => {
  it('valid email+password returns 200 with tokens and persists a hashed refresh token', async () => {
    await seedUser();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: SEED_EMAIL, password: SEED_PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.data.accessToken).toBe('string');
    expect(typeof body.data.refreshToken).toBe('string');
    expect(Object.keys(body.data.user).sort()).toEqual(['email', 'id']);

    const tokenHash = hashRefreshToken(body.data.refreshToken);
    const [row] = await testDb
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    expect(row).toBeDefined();
    expect(row?.revokedAt).toBeNull();
  });

  it('wrong password returns 401 with no tokens and the standard message', async () => {
    await seedUser();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: SEED_EMAIL, password: 'totally-wrong-password' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.data).toBeNull();
    expect(body.message).toBe('Email ou senha incorretos.');
    expect(res.payload).not.toContain('accessToken');
    expect(res.payload).not.toContain('refreshToken');
  });

  it('unknown email returns 401 with the identical message (no user enumeration)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'does-not-exist@example.com', password: 'whatever' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.message).toBe('Email ou senha incorretos.');
  });

  it('missing email field returns 400 with a field-level error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { password: 'whatever' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.data.fields[0].field).toBe('email');
  });
});
