import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { sealCredential, openCredential, maskSecret } from '../../src/security/credential-vault.js';

const MASTER_KEY = randomBytes(32);

describe('credential-vault', () => {
  it('seals the same plaintext twice into two different strings that both open back to the original', () => {
    const plaintext = 'super-secret-binance-key';
    const sealedA = sealCredential(plaintext, MASTER_KEY);
    const sealedB = sealCredential(plaintext, MASTER_KEY);

    expect(sealedA).not.toBe(sealedB);
    expect(openCredential(sealedA, MASTER_KEY)).toBe(plaintext);
    expect(openCredential(sealedB, MASTER_KEY)).toBe(plaintext);
  });

  it('throws when the ciphertext has a single flipped byte', () => {
    const sealed = sealCredential('another-secret', MASTER_KEY);
    const prefix = 'v1';
    const encoded = sealed.slice(3);
    const payload = Buffer.from(encoded, 'base64');
    // Flip a byte in the middle of the payload (inside ciphertext/nonce region).
    const tamperedIndex = Math.floor(payload.length / 2);
    payload[tamperedIndex] = payload[tamperedIndex]! ^ 0xff;
    const tampered = `${prefix}:${payload.toString('base64')}`;

    expect(() => openCredential(tampered, MASTER_KEY)).toThrow();
  });

  it('throws when opened with a different 32-byte key', () => {
    const sealed = sealCredential('yet-another-secret', MASTER_KEY);
    const wrongKey = randomBytes(32);

    expect(() => openCredential(sealed, wrongKey)).toThrow();
  });

  it('produces output starting with the v1: version prefix', () => {
    const sealed = sealCredential('prefix-check', MASTER_KEY);
    expect(sealed.startsWith('v1:')).toBe(true);
  });

  it('decodes to a payload at least 28 bytes long with differing leading 12 bytes across two seals', () => {
    const plaintext = 'nonce-uniqueness-check';
    const sealedA = sealCredential(plaintext, MASTER_KEY);
    const sealedB = sealCredential(plaintext, MASTER_KEY);

    const payloadA = Buffer.from(sealedA.slice(3), 'base64');
    const payloadB = Buffer.from(sealedB.slice(3), 'base64');

    expect(payloadA.length).toBeGreaterThanOrEqual(28);
    expect(payloadB.length).toBeGreaterThanOrEqual(28);
    expect(payloadA.subarray(0, 12).equals(payloadB.subarray(0, 12))).toBe(false);
  });

  it('masks a secret, keeping only the last 4 characters visible', () => {
    const masked = maskSecret('ABCDEFGH1234ab12');
    expect(masked.endsWith('ab12')).toBe(true);
    expect(masked).not.toContain('ABCDEFGH');
  });
});
