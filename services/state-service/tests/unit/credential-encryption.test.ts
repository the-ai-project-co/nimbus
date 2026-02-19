import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as crypto from 'node:crypto';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';

// Re-implement the encryption functions to test them directly
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTION_SALT = 'nimbus-credential-store-v1';

function deriveEncryptionKey(): Buffer {
  const machineSecret = `${os.hostname()}:${os.userInfo().username}:${ENCRYPTION_SALT}`;
  return crypto.pbkdf2Sync(machineSecret, ENCRYPTION_SALT, 100_000, KEY_LENGTH, 'sha256');
}

function encryptData(plaintext: string): string {
  const key = deriveEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptData(encoded: string): string {
  const key = deriveEncryptionKey();
  const data = Buffer.from(encoded, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
}

describe('Credential Encryption (AES-256-GCM)', () => {
  test('encrypt/decrypt roundtrip preserves data', () => {
    const original = JSON.stringify({ accessKeyId: 'AKIA...', secretAccessKey: 's3cr3t' });
    const encrypted = encryptData(original);
    const decrypted = decryptData(encrypted);
    expect(decrypted).toBe(original);
  });

  test('encrypted output is not readable as plaintext', () => {
    const secret = 'my-super-secret-value';
    const encrypted = encryptData(secret);
    expect(encrypted).not.toContain(secret);
    // Should be valid base64
    expect(() => Buffer.from(encrypted, 'base64')).not.toThrow();
  });

  test('each encryption produces different ciphertext (random IV)', () => {
    const plaintext = 'same-input';
    const enc1 = encryptData(plaintext);
    const enc2 = encryptData(plaintext);
    expect(enc1).not.toBe(enc2);
    // But both decrypt to the same value
    expect(decryptData(enc1)).toBe(plaintext);
    expect(decryptData(enc2)).toBe(plaintext);
  });

  test('tampered ciphertext is detected', () => {
    const encrypted = encryptData('sensitive-data');
    const buf = Buffer.from(encrypted, 'base64');
    // Flip a byte in the ciphertext portion
    buf[IV_LENGTH + AUTH_TAG_LENGTH + 1] ^= 0xff;
    const tampered = buf.toString('base64');
    expect(() => decryptData(tampered)).toThrow();
  });

  test('tampered auth tag is detected', () => {
    const encrypted = encryptData('sensitive-data');
    const buf = Buffer.from(encrypted, 'base64');
    // Flip a byte in the auth tag
    buf[IV_LENGTH + 1] ^= 0xff;
    const tampered = buf.toString('base64');
    expect(() => decryptData(tampered)).toThrow();
  });

  test('handles empty string', () => {
    const encrypted = encryptData('');
    const decrypted = decryptData(encrypted);
    expect(decrypted).toBe('');
  });

  test('handles large JSON payloads', () => {
    const largePayload = JSON.stringify({
      provider: 'aws',
      accessKeyId: 'A'.repeat(200),
      secretAccessKey: 'B'.repeat(200),
      sessionToken: 'C'.repeat(1000),
    });
    const encrypted = encryptData(largePayload);
    const decrypted = decryptData(encrypted);
    expect(decrypted).toBe(largePayload);
  });

  test('backward compatibility: base64-encoded data is not valid AES', () => {
    // Simulate old-style base64 storage
    const oldData = Buffer.from('{"key":"value"}').toString('base64');
    // decryptData should throw on old-style base64 (not valid AES-256-GCM)
    expect(() => decryptData(oldData)).toThrow();
  });
});
