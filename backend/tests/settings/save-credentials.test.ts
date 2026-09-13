import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import ccxt from 'ccxt';
import argon2 from 'argon2';
import { testDb } from '../setup/db.js';
import { createUserRepository } from '../../src/modules/auth/infrastructure/user.repository.js';
import { settings } from '../../src/persistence/schema/settings.js';

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

const SEED_EMAIL = 'seed-settings-test@example.com';
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

let loginCallCount = 0;

// Each test gets a distinct remoteAddress so the per-IP login rate limit
// (5 attempts/15min, D-20/D-21) does not trip across the several logins this
// file performs against a single shared app instance — that limiter is
// exercised on its own terms in tests/auth/rate-limit.test.ts.
async function seedUserAndLogin(): Promise<string> {
  loginCallCount += 1;
  const remoteAddress = `203.0.113.${loginCallCount}`;

  const repo = createUserRepository(testDb);
  const passwordHash = await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id });
  await repo.upsertByEmail(SEED_EMAIL, passwordHash);

  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    remoteAddress,
    payload: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  return res.json().data.accessToken as string;
}

describe('PUT /settings/credentials', () => {
  it('saves valid credentials, returns 200, and writes exactly one encrypted settings row', async () => {
    const token = await seedUserAndLogin();

    const res = await app.inject({
      method: 'PUT',
      url: '/settings/credentials',
      headers: { authorization: `Bearer ${token}` },
      payload: { accessKey: ACCESS_KEY, secretKey: SECRET_KEY },
    });

    expect(res.statusCode).toBe(200);

    const rows = await testDb.select().from(settings);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.encryptedSecretKey).not.toBe(SECRET_KEY);
    expect(rows[0]?.encryptedSecretKey.startsWith('v1:')).toBe(true);
  });

  it('saving twice updates the same row instead of inserting a second one', async () => {
    const token = await seedUserAndLogin();

    await app.inject({
      method: 'PUT',
      url: '/settings/credentials',
      headers: { authorization: `Bearer ${token}` },
      payload: { accessKey: ACCESS_KEY, secretKey: SECRET_KEY },
    });

    await app.inject({
      method: 'PUT',
      url: '/settings/credentials',
      headers: { authorization: `Bearer ${token}` },
      payload: { accessKey: 'another-access-key-999', secretKey: 'another-secret-key-999' },
    });

    const rows = await testDb.select().from(settings);
    expect(rows).toHaveLength(1);
  });

  it('rejects with 400 and the invalid-key message when ccxt throws AuthenticationError, without writing a row', async () => {
    const token = await seedUserAndLogin();
    fetchBalanceImpl = async () => {
      throw new ccxt.AuthenticationError('bad key');
    };

    const res = await app.inject({
      method: 'PUT',
      url: '/settings/credentials',
      headers: { authorization: `Bearer ${token}` },
      payload: { accessKey: ACCESS_KEY, secretKey: SECRET_KEY },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe(
      'Chave ou segredo inválidos. Verifique as credenciais geradas no painel da Binance e tente novamente.',
    );

    const rows = await testDb.select().from(settings);
    expect(rows).toHaveLength(0);
  });

  it('rejects with the permission message when ccxt throws PermissionDenied', async () => {
    const token = await seedUserAndLogin();
    fetchBalanceImpl = async () => {
      throw new ccxt.PermissionDenied('no permission');
    };

    const res = await app.inject({
      method: 'PUT',
      url: '/settings/credentials',
      headers: { authorization: `Bearer ${token}` },
      payload: { accessKey: ACCESS_KEY, secretKey: SECRET_KEY },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe(
      'As credenciais são válidas, mas não têm permissão de leitura de saldo. Habilite essa permissão no painel da Binance.',
    );
  });

  it('returns 503 when ccxt throws NetworkError', async () => {
    const token = await seedUserAndLogin();
    fetchBalanceImpl = async () => {
      throw new ccxt.NetworkError('timeout');
    };

    const res = await app.inject({
      method: 'PUT',
      url: '/settings/credentials',
      headers: { authorization: `Bearer ${token}` },
      payload: { accessKey: ACCESS_KEY, secretKey: SECRET_KEY },
    });

    expect(res.statusCode).toBe(503);
  });

  it('an unauthenticated request returns 401', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/settings/credentials',
      payload: { accessKey: ACCESS_KEY, secretKey: SECRET_KEY },
    });

    expect(res.statusCode).toBe(401);
  });

  it('a body missing secretKey returns 400 with a field-level error', async () => {
    const token = await seedUserAndLogin();

    const res = await app.inject({
      method: 'PUT',
      url: '/settings/credentials',
      headers: { authorization: `Bearer ${token}` },
      payload: { accessKey: ACCESS_KEY },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().data.fields[0].field).toBe('secretKey');
  });
});
