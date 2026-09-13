import { encrypt, decrypt } from './crypto.js';

const VERSION_PREFIX = 'v1:';
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const MASK = '••••••••••••';

export function sealCredential(plaintext: string, masterKey: Buffer): string {
  const { nonce, ciphertext, authTag } = encrypt(plaintext, masterKey);
  const payload = Buffer.concat([nonce, ciphertext, authTag]);
  return `${VERSION_PREFIX}${payload.toString('base64')}`;
}

export function openCredential(sealed: string, masterKey: Buffer): string {
  if (!sealed.startsWith(VERSION_PREFIX)) {
    throw new Error('Unknown credential vault format version');
  }

  const encoded = sealed.slice(VERSION_PREFIX.length);
  const payload = Buffer.from(encoded, 'base64');

  if (payload.length < NONCE_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Malformed sealed credential payload');
  }

  const nonce = payload.subarray(0, NONCE_LENGTH);
  const authTag = payload.subarray(payload.length - AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(NONCE_LENGTH, payload.length - AUTH_TAG_LENGTH);

  return decrypt(nonce, ciphertext, authTag, masterKey);
}

export function maskSecret(plaintext: string): string {
  if (plaintext.length < 4) {
    return MASK;
  }
  const lastFour = plaintext.slice(-4);
  return `${MASK}${lastFour}`;
}
