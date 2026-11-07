import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * AES-256-GCM with the backend's format (IV + tag + ciphertext, base64 for strings), so values
 * encrypted by either side with the same key read on the other. Deterministic encryption derives
 * the IV from the key and the value, so equal values can be looked up.
 */
export class Encryption {
  private readonly key: Buffer;

  constructor(key: string) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(key.trim()))
      throw new Error('Invalid encryption key encoding - expected base64');
    this.key = Buffer.from(key, 'base64');
    if (this.key.length !== 32) throw new Error('Invalid key length - expected a 32-byte key');
  }

  encryptBuffer(data: Uint8Array, deterministic = false): Buffer {
    const iv = deterministic
      ? createHash('sha256').update(this.key).update(data).digest().subarray(0, IV_LENGTH)
      : randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  }

  decryptBuffer(data: Uint8Array): Buffer {
    const buffer = Buffer.from(data);
    if (buffer.length < IV_LENGTH + TAG_LENGTH) throw new Error('Invalid encrypted data length');
    const decipher = createDecipheriv(ALGORITHM, this.key, buffer.subarray(0, IV_LENGTH));
    decipher.setAuthTag(buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
    return Buffer.concat([
      decipher.update(buffer.subarray(IV_LENGTH + TAG_LENGTH)),
      decipher.final(),
    ]);
  }

  encryptString(value: string, deterministic = false): string {
    return this.encryptBuffer(Buffer.from(value, 'utf8'), deterministic).toString('base64');
  }

  decryptString(value: string): string {
    return this.decryptBuffer(Buffer.from(value, 'base64')).toString('utf8');
  }
}
