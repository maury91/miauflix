import { randomBytes } from 'crypto';

import { EncryptionService } from './encryption.service';

const generateKey = () => randomBytes(32).toString('base64'); // Generate a valid 256-bit key

describe('EncryptionService', () => {
  let encryptionService: EncryptionService;
  const testKey = generateKey();

  beforeEach(() => {
    encryptionService = new EncryptionService(testKey);
  });

  describe('constructor', () => {
    it('should create instance with valid base64 key', () => {
      expect(() => new EncryptionService(testKey)).not.toThrow();
    });

    it('should throw error with empty key', () => {
      expect(() => new EncryptionService('')).toThrow('Encryption key is required');
    });

    it('should throw error with invalid key length', () => {
      const shortKey = Buffer.from('short').toString('base64');
      expect(() => new EncryptionService(shortKey)).toThrow('Invalid key length');
    });

    it('should throw error with malformed base64', () => {
      expect(() => new EncryptionService('not-base64!')).toThrow(
        'Invalid encryption key encoding - expected base64'
      );
    });
  });

  describe('encrypt/decrypt', () => {
    const testData = 'magnet:?xt=urn:btih:test-hash&dn=test-movie';

    it('should encrypt and decrypt data correctly', () => {
      const encrypted = encryptionService.encryptString(testData);
      const decrypted = encryptionService.decryptString(encrypted);

      expect(decrypted).toBe(testData);
    });

    it('should produce different ciphertext for same plaintext', () => {
      const encrypted1 = encryptionService.encryptString(testData);
      const encrypted2 = encryptionService.encryptString(testData);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should handle empty string', () => {
      const encrypted = encryptionService.encryptString('');
      const decrypted = encryptionService.decryptString(encrypted);

      expect(decrypted).toBe('');
    });

    it('should handle long strings', () => {
      const longString = 'a'.repeat(10000);
      const encrypted = encryptionService.encryptString(longString);
      const decrypted = encryptionService.decryptString(encrypted);

      expect(decrypted).toBe(longString);
    });

    it('should throw error with corrupted ciphertext', () => {
      const encrypted = encryptionService.encryptString(testData);
      const corrupted = encrypted.slice(0, -10) + '0123456789'; // Corrupt last 10 chars

      expect(() => encryptionService.decryptString(corrupted)).toThrow(
        'Buffer decryption failed - data may be corrupted or key may be incorrect'
      );
    });

    it('should throw error with invalid base64', () => {
      expect(() => encryptionService.decryptString('invalid-base64!')).toThrow(
        'Invalid encrypted data length'
      );
    });

    it('should produce identical ciphertext when using deterministic encryption', () => {
      const testData = 'test-deterministic-encryption';
      const encrypted1 = encryptionService.encryptString(testData, true);
      const encrypted2 = encryptionService.encryptString(testData, true);

      expect(encrypted1).toBe(encrypted2);

      // Verify decryption still works
      const decrypted = encryptionService.decryptString(encrypted1);
      expect(decrypted).toBe(testData);
    });

    it('should throw error with too short data', () => {
      const tooShort = Buffer.alloc(10).toString('base64'); // Less than IV + TAG length
      expect(() => encryptionService.decryptString(tooShort)).toThrow(
        'Invalid encrypted data length'
      );
    });
  });
});
