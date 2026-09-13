import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGO = 'aes-256-gcm';

export interface EncryptedPayload {
  nonce: Buffer;
  ciphertext: Buffer;
  authTag: Buffer;
}

export function encrypt(plaintext: string, masterKey: Buffer): EncryptedPayload {
  const nonce = randomBytes(12);
  const cipher = createCipheriv(ALGO, masterKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { nonce, ciphertext, authTag };
}

export function decrypt(nonce: Buffer, ciphertext: Buffer, authTag: Buffer, masterKey: Buffer): string {
  const decipher = createDecipheriv(ALGO, masterKey, nonce);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
