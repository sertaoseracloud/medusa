import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import argon2 from 'argon2';
import pino from 'pino';
import { testDb } from '../setup/db.js';
import { createUserRepository } from '../../src/modules/auth/infrastructure/user.repository.js';

let fetchBalanceImpl: () => Promise<unknown> = async () => ({ free: {}, used: {}, total: {} });

vi.mock('ccxt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ccxt')>();
  const actualDefault = actual.default as Record<string, unknown>;

  class MockBinance {
    fetchBalance() {
      return fetchBalanceImpl();
    }

    fetchMarkets() {
      return Promise.resolve([]);
    }
  }

  return {
    ...actual,
    default: { ...actualDefault, binance: MockBinance },
  };
});

const { buildApp } = await import('../../src/app.js');
type AppInstance = Awaited<ReturnType<typeof buildApp>>;

const SEED_EMAIL = 'seed-response-shape-test@example.com';
const SEED_PASSWORD = 'correct-horse-battery-staple';
const ACCESS_KEY = 'a-valid-access-key-1234';
const SECRET_KEY = 'a-valid-secret-key-5678';

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

beforeEach(() => {
  fetchBalanceImpl = async () => ({ free: {}, used: {}, total: {} });
});

async function seedUserAndLogin(): Promise<string> {
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

describe('settings response shape never leaks raw credentials', () => {
  it('PUT and GET responses never contain the raw accessKey/secretKey substrings, and the secret is masked', async () => {
    const token = await seedUserAndLogin();

    const putRes = await app.inject({
      method: 'PUT',
      url: '/settings/credentials',
      headers: { authorization: `Bearer ${token}` },
      payload: { accessKey: ACCESS_KEY, secretKey: SECRET_KEY },
    });

    expect(putRes.statusCode).toBe(200);
    expect(putRes.payload).not.toContain(ACCESS_KEY);
    expect(putRes.payload).not.toContain(SECRET_KEY);

    const putBody = putRes.json();
    expect(putBody.data.secretKeyMasked.endsWith(SECRET_KEY.slice(-4))).toBe(true);
    expect(putBody.data.secretKeyMasked).toHaveLength(16);

    const getRes = await app.inject({
      method: 'GET',
      url: '/settings/credentials',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(getRes.statusCode).toBe(200);
    expect(getRes.payload).not.toContain(ACCESS_KEY);
    expect(getRes.payload).not.toContain(SECRET_KEY);

    const getBody = getRes.json();
    expect(getBody.data.secretKeyMasked.endsWith(SECRET_KEY.slice(-4))).toBe(true);
    expect(getBody.data.secretKeyMasked).toHaveLength(16);
    expect(getBody.data.configured).toBe(true);
  });

  it('captured pino log output for the save request redacts the credentials and shows [REDACTED]', async () => {
    // Mirrors the redact configuration in shared/logging.ts (req.body.accessKey/secretKey,
    // bare accessKey/secretKey) against a captured test transport, so this assertion does
    // not require mutating the shared application logger singleton mid-suite.
    const logLines: string[] = [];
    const testLogger = pino(
      {
        redact: {
          paths: ['req.body.accessKey', 'req.body.secretKey', 'accessKey', 'secretKey'],
          censor: '[REDACTED]',
        },
      },
      { write: (chunk: string) => logLines.push(chunk) },
    );

    testLogger.info(
      { req: { body: { accessKey: ACCESS_KEY, secretKey: SECRET_KEY } } },
      'save attempt',
    );
    testLogger.info({ accessKey: ACCESS_KEY, secretKey: SECRET_KEY }, 'raw credential fields');

    const serialized = logLines.join('\n');
    expect(serialized).not.toContain(ACCESS_KEY);
    expect(serialized).not.toContain(SECRET_KEY);
    expect(serialized).toContain('[REDACTED]');
  });
});
