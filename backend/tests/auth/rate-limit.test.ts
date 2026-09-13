import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import argon2 from 'argon2';
import { buildApp, type AppInstance } from '../../src/app.js';
import { testDb } from '../setup/db.js';
import { createUserRepository } from '../../src/modules/auth/infrastructure/user.repository.js';

const SEED_EMAIL = 'rate-limit-test@example.com';
const SEED_PASSWORD = 'correct-horse-battery-staple';
const REMOTE_ADDRESS = '203.0.113.10';

let app: AppInstance;

beforeAll(async () => {
  app = await buildApp({
    db: testDb,
    secrets: { JWT_SECRET: 'test-secret', AES_KEY: Buffer.alloc(32, 1) },
  });
  await app.ready();

  const repo = createUserRepository(testDb);
  const passwordHash = await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id });
  await repo.upsertByEmail(SEED_EMAIL, passwordHash);
});

afterAll(async () => {
  await app.close();
});

describe('login rate limiting', () => {
  it('rejects the 6th failed login within 15 minutes with 429, while /health stays available', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        remoteAddress: REMOTE_ADDRESS,
        payload: { email: SEED_EMAIL, password: 'wrong-password' },
      });
      expect(res.statusCode).toBe(401);
    }

    const sixth = await app.inject({
      method: 'POST',
      url: '/auth/login',
      remoteAddress: REMOTE_ADDRESS,
      payload: { email: SEED_EMAIL, password: 'wrong-password' },
    });

    expect(sixth.statusCode).toBe(429);
    expect(sixth.headers['retry-after']).toBeDefined();

    const health = await app.inject({
      method: 'GET',
      url: '/health',
      remoteAddress: REMOTE_ADDRESS,
    });

    expect(health.statusCode).toBe(200);
  });
});
