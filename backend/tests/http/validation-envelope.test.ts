import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp, type AppInstance } from '../../src/app.js';
import { createDb } from '../../src/persistence/db.js';
import { DomainError } from '../../src/shared/errors/domain-error.js';

class TestConflictError extends DomainError {
  readonly statusCode = 409;

  readonly code = 'TEST_CONFLICT';
}

let app: AppInstance;

beforeAll(async () => {
  const db = createDb(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '');
  app = await buildApp({
    db,
    secrets: { JWT_SECRET: 'test-secret', AES_KEY: Buffer.alloc(32, 1) },
  });

  app.get('/test/conflict', async () => {
    throw new TestConflictError('resource already exists');
  });

  app.get('/test/boom', async () => {
    throw new Error('leak me');
  });

  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('validation envelope', () => {
  it('GET /health returns 200 with the standard envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(['data', 'message', 'timestamp']);
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('POST /health/echo with invalid body returns 400 with per-field errors', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/health/echo',
      payload: { email: 'nope', amount: -1 },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.message).toBe('Validation failed');
    const fields = body.data.fields as Array<{ field: string; message: string }>;
    expect(fields.some((f) => f.field === 'email')).toBe(true);
    expect(fields.some((f) => f.field === 'amount')).toBe(true);
  });

  it('a DomainError subclass maps to its own status code', async () => {
    const res = await app.inject({ method: 'GET', url: '/test/conflict' });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.message).toBe('resource already exists');
    expect(body.data).toBeNull();
  });

  it('an unknown error returns an opaque 500', async () => {
    const res = await app.inject({ method: 'GET', url: '/test/boom' });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('leak me');
  });
});
