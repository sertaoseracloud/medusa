import { randomBytes } from 'node:crypto';

export interface AppSecrets {
  JWT_SECRET: string;
  AES_KEY: Buffer;
}

export function loadSecrets(env: NodeJS.ProcessEnv): AppSecrets {
  const isProd = env.NODE_ENV === 'production';
  const jwtSecret = env.JWT_SECRET;
  const aesKeyRaw = env.AES_KEY;

  // WR-05: a weak/short JWT_SECRET would let an attacker forge access
  // tokens. Enforce a minimum of 32 bytes in production, mirroring the
  // AES_KEY length check below. Dev keeps the permissive fallback path.
  const MIN_JWT_SECRET_LENGTH = 32;

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

  if (isProd && jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters in production, got ${jwtSecret.length}.`,
    );
  }

  // CR-02: AES_KEY must be 32 RAW random bytes, base64-encoded (not 16
  // random bytes hex-encoded into 32 ASCII characters — that recipe only
  // carries ~128 bits of real entropy despite passing the length check).
  const aesKey = Buffer.from(aesKeyRaw, 'base64');
  if (aesKey.length !== 32) {
    throw new Error(
      `AES_KEY must decode (base64) to exactly 32 bytes, got ${aesKey.length}. ` +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }

  return { JWT_SECRET: jwtSecret, AES_KEY: aesKey };
}
