import { logger } from '@logger';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

import { ENV } from '@constants';

export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyBuffer: Buffer;
  private readonly IV_LENGTH = 12; // 96-bit IV for GCM (standard)
  private readonly TAG_LENGTH = 16; // 128-bit auth tag

  constructor() {
    const key = ENV('SOURCE_SECURITY_KEY');
    if (!key) {
      throw new Error('Encryption key is required');
    }

    // Convert base64 key to buffer
    try {
      this.keyBuffer = Buffer.from(key, 'base64');
      if (this.keyBuffer.length !== 32) {
        throw new Error('Invalid key length - expected 32 bytes (256-bit) key');
      }
    } catch (error) {
      throw new Error(
        `Invalid encryption key format: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Encrypt a string value using AES-256-GCM
   * Returns base64-encoded: IV (12 bytes) + AuthTag (16 bytes) + Encrypted Data
   * To save space when plainEmpty is true, an empty string is encrypted as an empty string
   */
  encryptString(plaintext: string, deterministic = false, plainEmpty = true): string {
    return plaintext === '' && plainEmpty
      ? ''
      : this.encryptBuffer(Buffer.from(plaintext, 'utf8'), deterministic).toString('base64');
  }

  /**
   * Decrypt a previously encrypted value using AES-256-GCM
   * To save space when plainEmpty is true, an empty string is decrypted as an empty string
   */
  decryptString(encryptedValue: string, plainEmpty = true): string {
    return encryptedValue === '' && plainEmpty
      ? ''
      : this.decryptBuffer(Buffer.from(encryptedValue, 'base64')).toString('utf8');
  }

  /**
   * Encrypt binary data (Buffer) using AES-256-GCM
   * Returns Buffer: IV (12 bytes) + AuthTag (16 bytes) + Encrypted Data
   */
  encryptBuffer(data: Buffer, deterministic = false): Buffer {
    try {
      const iv = deterministic
        ? createHash('sha256')
            .update(this.keyBuffer)
            .update(data)
            .digest()
            .subarray(0, this.IV_LENGTH)
        : randomBytes(this.IV_LENGTH); // 96-bit IV for GCM
      const cipher = createCipheriv(this.algorithm, this.keyBuffer, iv);

      const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

      const tag = cipher.getAuthTag();

      // Concatenate: IV + AuthTag + EncryptedData
      return Buffer.concat([iv, tag, encrypted]);
    } catch (error) {
      logger.error(
        'EncryptionService',
        `Buffer encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw new Error('Buffer encryption failed');
    }
  }

  /**
   * Decrypt binary data that was encrypted with encryptBuffer
   * Expects Buffer: IV (12 bytes) + AuthTag (16 bytes) + Encrypted Data
   */
  decryptBuffer(encryptedData: Buffer): Buffer {
    try {
      if (encryptedData.length < this.IV_LENGTH + this.TAG_LENGTH) {
        throw new Error('Invalid encrypted data length');
      }

      // Extract components from the concatenated buffer
      const iv = encryptedData.subarray(0, this.IV_LENGTH);
      const tag = encryptedData.subarray(this.IV_LENGTH, this.IV_LENGTH + this.TAG_LENGTH);
      const encrypted = encryptedData.subarray(this.IV_LENGTH + this.TAG_LENGTH);

      const decipher = createDecipheriv(this.algorithm, this.keyBuffer, iv);
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

      return decrypted;
    } catch (error) {
      logger.error(
        'EncryptionService',
        `Buffer decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw new Error('Buffer decryption failed - data may be corrupted or key may be incorrect');
    }
  }
}
