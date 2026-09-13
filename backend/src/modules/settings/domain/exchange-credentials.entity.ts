/**
 * SettingsRecord mirrors the `settings` table row.
 *
 * `encryptedAccessKey`/`encryptedSecretKey` are sealed strings produced by
 * `security/credential-vault.ts` (`sealCredential`) — they must only ever be
 * opened via `openCredential` from that same module. No other code may
 * attempt to decrypt or interpret these values directly.
 */
export interface SettingsRecord {
  id: string;
  userId: string;
  exchangeId: string;
  encryptedAccessKey: string;
  encryptedSecretKey: string;
  keyVersion: string;
  createdAt: Date;
  updatedAt: Date;
}
