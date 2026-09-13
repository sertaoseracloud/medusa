import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp, type AppInstance } from '../../src/app.js';
import { testDb } from '../setup/db.js';
import { refreshTokens } from '../../src/persistence/schema/refresh-tokens.js';
import { createUserRepository } from '../../src/modules/auth/infrastructure/user.repository.js';
import { hashRefreshToken } from '../../src/modules/auth/infrastructure/jwt.js';
import argon2 from 'argon2';

const SEED_EMAIL = 'logout-test@example.com';
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

async function seedUser(email = SEED_EMAIL, password = SEED_PASSWORD): Promise<void> {
  const repo = createUserRepository(testDb);
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await repo.upsertByEmail(email, passwordHash);
}

let loginCounter = 0;

async function login(
  email = SEED_EMAIL,
  password = SEED_PASSWORD,
): Promise<{ accessToken: string; refreshToken: string }> {
  await seedUser(email, password);
  loginCounter += 1;
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    // Each test may log in more than once; a shared remoteAddress would
    // otherwise trip the 5/15min login rate limiter across unrelated tests.
    remoteAddress: `203.0.113.${loginCounter % 254}`,
    payload: { email, password },
  });
  const body = res.json();
  return { accessToken: body.data.accessToken, refreshToken: body.data.refreshToken };
}

describe('POST /auth/logout', () => {
  it('logout then refresh with the same token returns 401, and revoked_at is non-null', async () => {
    const { accessToken, refreshToken } = await login();

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { refreshToken },
    });
    expect(logoutRes.statusCode).toBe(204);

    const tokenHash = hashRefreshToken(refreshToken);
    const [row] = await testDb.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);
    expect(row?.revokedAt).not.toBeNull();

    const refreshRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(refreshRes.statusCode).toBe(401);
  });

  it('logout with an unknown refresh token still returns 204', async () => {
    const { accessToken } = await login();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { refreshToken: 'unknown-token-value' },
    });
    expect(res.statusCode).toBe(204);
  });

  it('logout without an access token returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: 'whatever' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('a second logout with the same token returns 204 and does not resurrect anything', async () => {
    const { accessToken, refreshToken } = await login();

    const first = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { refreshToken },
    });
    expect(first.statusCode).toBe(204);

    const second = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { refreshToken },
    });
    expect(second.statusCode).toBe(204);

    const tokenHash = hashRefreshToken(refreshToken);
    const [row] = await testDb.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);
    expect(row?.revokedAt).not.toBeNull();
  });
});

describe('PATCH /auth/password', () => {
  it('correct current password returns 204, new password logs in, old one 401s, and all prior refresh tokens die', async () => {
    const email = 'password-change-test@example.com';
    const currentPassword = 'correct-horse-battery-staple';
    const newPassword = 'new-correct-horse-battery-staple';
    const { accessToken, refreshToken } = await login(email, currentPassword);

    const changeRes = await app.inject({
      method: 'PATCH',
      url: '/auth/password',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { currentPassword, newPassword },
    });
    expect(changeRes.statusCode).toBe(204);

    const oldLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: currentPassword },
    });
    expect(oldLoginRes.statusCode).toBe(401);

    const newLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: newPassword },
    });
    expect(newLoginRes.statusCode).toBe(200);

    const refreshRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(refreshRes.statusCode).toBe(401);
  });

  it('a wrong current password returns 401 and the stored hash is unchanged', async () => {
    const email = 'password-wrong-current-test@example.com';
    const currentPassword = 'correct-horse-battery-staple';
    const { accessToken } = await login(email, currentPassword);

    const repo = createUserRepository(testDb);
    const userBefore = await repo.findByEmail(email);

    const changeRes = await app.inject({
      method: 'PATCH',
      url: '/auth/password',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { currentPassword: 'totally-wrong', newPassword: 'new-correct-horse-battery-staple' },
    });
    expect(changeRes.statusCode).toBe(401);

    const userAfter = await repo.findByEmail(email);
    expect(userAfter?.passwordHash).toBe(userBefore?.passwordHash);
  });

  it('a 6-character newPassword returns 400 with data.fields[0].field === newPassword', async () => {
    const email = 'password-too-short-test@example.com';
    const currentPassword = 'correct-horse-battery-staple';
    const { accessToken } = await login(email, currentPassword);

    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/password',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { currentPassword, newPassword: 'short1' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.data.fields[0].field).toBe('newPassword');
  });
});
