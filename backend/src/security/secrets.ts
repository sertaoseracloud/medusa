import { randomBytes } from 'node:crypto';

export interface AppSecrets {
  JWT_SECRET: string;
  AES_KEY: Buffer;
}

export function loadSecrets(env: NodeJS.ProcessEnv): AppSecrets {
  const isProd = env.NODE_ENV === 'production';
  const jwtSecret = env.JWT_SECRET;
  const aesKeyRaw = env.AES_KEY;

  if (!jwtSecret || !aesKeyRaw) {
    if (isProd) {
      throw new Error('JWT_SECRET and AES_KEY are required in production — refusing to start.');
    }

    const tempKey = randomBytes(32);
    // eslint-disable-next-line no-console
    console.warn(
      '[secrets] JWT_SECRET/AES_KEY not set — using a temporary in-memory key for this run only. ' +
        'Set JWT_SECRET and AES_KEY in .env for persistence across restarts.',
    );
    return {
      JWT_SECRET: jwtSecret ?? tempKey.toString('hex'),
      AES_KEY: tempKey,
    };
  }

  const aesKey = Buffer.from(aesKeyRaw, 'utf8');
  if (aesKey.length !== 32) {
    throw new Error(`AES_KEY must decode to exactly 32 bytes, got ${aesKey.length}.`);
  }

  return { JWT_SECRET: jwtSecret, AES_KEY: aesKey };
}
