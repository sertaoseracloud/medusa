import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { buildApp, type AppInstance } from '../../src/app.js';
import { testDb } from '../setup/db.js';
import { createUserRepository } from '../../src/modules/auth/infrastructure/user.repository.js';

const SEED_EMAIL = 'jwt-verification-test@example.com';
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

async function getValidAccessToken(): Promise<string> {
  const repo = createUserRepository(testDb);
  const passwordHash = await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id });
  await repo.upsertByEmail(SEED_EMAIL, passwordHash);

  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  return res.json().data.accessToken as string;
}

describe('GET /auth/me — JWT verification', () => {
  it('no Authorization header returns 401 (not 500)', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('Authorization: Bearer not-a-jwt returns 401 (not 500)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: 'Bearer not-a-jwt' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('a token signed with a different secret returns 401 (not 500)', async () => {
    const foreignToken = jwt.sign({ sub: 'someone' }, 'a-different-secret', { expiresIn: '15m' });
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${foreignToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('a structurally valid token with exp in the past returns 401 (not 500)', async () => {
    const expiredToken = jwt.sign({ sub: 'someone' }, JWT_SECRET, { expiresIn: -10 });
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('Authorization: Basic abc returns 401 (not 500)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: 'Basic abc' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('the server keeps responding after malformed-token requests', async () => {
    await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: 'Bearer garbage' } });
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
  });

  it('a freshly issued valid access token returns 200 with data.id and data.email', async () => {
    const accessToken = await getValidAccessToken();
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.id).toBeDefined();
    expect(body.data.email).toBe(SEED_EMAIL);
  });
});
