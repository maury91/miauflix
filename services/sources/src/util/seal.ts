import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { ServiceSecretCodec } from '@miauflix/service-configuration';

export function createSeal(keyFile: string, encryptionKey?: string) {
  const key = createHash('sha256')
    .update(encryptionKey ?? new ServiceSecretCodec({ filePath: keyFile }).key)
    .digest();
  return {
    seal(value: string): string {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return [iv, cipher.getAuthTag(), body].map(v => v.toString('base64url')).join('.');
    },
    open(value: string): string {
      const parts = value.split('.');
      if (parts.length !== 3) throw new Error('Invalid sealed value');
      const [iv, tag, body] = parts.map(v => Buffer.from(v, 'base64url'));
      if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid sealed value');
      const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    },
  };
}
