import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { buildApp, type AppInstance } from '../../src/app.js';
import { testDb } from '../setup/db.js';
import { refreshTokens } from '../../src/persistence/schema/refresh-tokens.js';
import { createUserRepository } from '../../src/modules/auth/infrastructure/user.repository.js';
import argon2 from 'argon2';

const SEED_EMAIL = 'refresh-test@example.com';
const SEED_PASSWORD = 'correct-horse-battery-staple';
const JWT_SECRET = 'test-secret';

let app: AppInstance;

beforeAll(async () => {
  app = await buildApp({
    db: testDb,
    secrets: { JWT_SECRET, AES_KEY: Buffer.alloc(32, 1) },
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

async function loginAndGetTokens(): Promise<{ accessToken: string; refreshToken: string }> {
  await seedUser();
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  const body = res.json();
  return { accessToken: body.data.accessToken, refreshToken: body.data.refreshToken };
}

describe('POST /auth/refresh', () => {
  it('returns a new access token and a new refresh token, and the new access token works on /auth/me', async () => {
    const { accessToken, refreshToken } = await loginAndGetTokens();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.accessToken).not.toBe(accessToken);
    expect(body.data.refreshToken).not.toBe(refreshToken);

    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${body.data.accessToken}` },
    });
    expect(meRes.statusCode).toBe(200);
  });

  it('rejects replay of the original refresh token after rotation, and inserts no new row on replay', async () => {
    const { refreshToken } = await loginAndGetTokens();

    const firstRefresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(firstRefresh.statusCode).toBe(200);

    const rowsBeforeReplay = await testDb.select().from(refreshTokens);
    const countBeforeReplay = rowsBeforeReplay.length;

    const replay = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(replay.statusCode).toBe(401);

    const rowsAfterReplay = await testDb.select().from(refreshTokens);
    expect(rowsAfterReplay.length).toBe(countBeforeReplay);
  });

  it('rejects a refresh token that was never issued', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'never-issued-token-value' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a refresh token row whose expires_at is in the past', async () => {
    const { refreshToken } = await loginAndGetTokens();
    const tokenHash = (await import('../../src/modules/auth/infrastructure/jwt.js')).hashRefreshToken(
      refreshToken,
    );

    await testDb
      .update(refreshTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(refreshTokens.tokenHash, tokenHash));

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(res.statusCode).toBe(401);
  });

  it('after one rotation exactly one row is un-revoked', async () => {
    const { refreshToken } = await loginAndGetTokens();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(res.statusCode).toBe(200);

    const rows = await testDb.select().from(refreshTokens);
    expect(rows.length).toBe(2);
    const activeRows = rows.filter((row) => row.revokedAt === null);
    expect(activeRows.length).toBe(1);
  });

  it('an expired access token is rejected by /auth/me but a valid refresh token still succeeds on /auth/refresh (SEC-02)', async () => {
    const { refreshToken } = await loginAndGetTokens();

    await seedUser();
    const user = await createUserRepository(testDb).findByEmail(SEED_EMAIL);
    const expiredAccessToken = jwt.sign({ sub: user?.id }, JWT_SECRET, { expiresIn: -10 });

    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${expiredAccessToken}` },
    });
    expect(meRes.statusCode).toBe(401);

    const refreshRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(refreshRes.statusCode).toBe(200);
  });
});
