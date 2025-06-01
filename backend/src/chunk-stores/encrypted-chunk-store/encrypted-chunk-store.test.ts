import { randomBytes } from 'crypto';
import fs from 'fs';
import { readdir, readFile, unlink } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import { runAbstractTests } from '../abstract-chunk-store/create-test-suite';
import EncryptedChunkStore from './encrypted-chunk-store';

const encryptionKey = 'test-key-123';
const TMP_DIR = 'tmp';

// Run abstract tests with single backing file
runAbstractTests(
  chunkLength => new EncryptedChunkStore(chunkLength, { encryptionKey }),
  'single backing file'
);

// Run abstract tests with random temp file
runAbstractTests(
  chunkLength => new EncryptedChunkStore(chunkLength, { encryptionKey }),
  'random temp file'
);

// Run abstract tests with multiple backing files
runAbstractTests(
  chunkLength =>
    new EncryptedChunkStore(chunkLength, {
      files: [
        { path: 'tmp/multi1', length: 500 },
        { path: 'tmp/multi2', length: 500 },
      ],
      encryptionKey,
    }),
  'multiple backing files'
);

describe('Encrypted Chunk Store', () => {
  const chunkLength = 16;
  const encryptionKey = 'test-key-123';

  afterEach(async () => {
    // Clean up any test files
    try {
      const files = fs.readdirSync('/tmp');
      for (const file of files) {
        if (file.startsWith('fs-chunk-store')) {
          await unlink(path.join('/tmp', file));
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Basic encryption functionality', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const storage = new EncryptedChunkStore(chunkLength, {
        encryptionKey,
        path: path.join(TMP_DIR, 'encrypt_decrypt_correctly'),
        files: [{ path: 'tmp/test_file', length: 16 }],
      });
      const testData = Buffer.from('hello world test');

      try {
        await promisify(cb => storage.put(0, testData, cb))();
        const dirContent = await readdir(path.join(TMP_DIR, 'encrypt_decrypt_correctly'));
        expect(dirContent).toHaveLength(1);
        const randomizedFilename = dirContent[0];
        expect(randomizedFilename).not.toBe('test_file');
        const encrypted = await readFile(
          `${TMP_DIR}/encrypt_decrypt_correctly/${randomizedFilename}`
        );
        expect(encrypted).not.toEqual(testData);

        const data = await promisify(cb => storage.get(0, cb))();
        expect(data).toEqual(testData);
      } finally {
        await promisify(cb => storage.destroy(cb))();
      }
    });
  });

  it('should handle multiple chunks independently', async () => {
    const storage = new EncryptedChunkStore(chunkLength, { encryptionKey });
    const testData1 = Buffer.from('chunk 1 data abc');
    const testData2 = Buffer.from('chunk 2 data xyz');

    try {
      await promisify(cb => storage.put(0, testData1, cb))();
      await promisify(cb => storage.put(1, testData2, cb))();

      // Get chunks in reverse order to test independence
      const data1 = await promisify(cb => storage.get(1, cb))();
      expect(data1).toEqual(testData2);

      const data0 = await promisify(cb => storage.get(0, cb))();
      expect(data0).toEqual(testData1);
    } finally {
      await promisify(cb => storage.destroy(cb))();
    }
  });

  it('should work with partial reads', async () => {
    const storage = new EncryptedChunkStore(chunkLength, { encryptionKey });
    const testData = Buffer.from('0123456789abcdef'); // exactly chunkLength

    try {
      await promisify(cb => storage.put(0, testData, cb))();

      // Read first 4 bytes
      const data1 = await promisify(cb => storage.get(0, { offset: 0, length: 4 }, cb))();
      expect(data1).toEqual(Buffer.from('0123'));

      // Read middle 4 bytes
      const data2 = await promisify(cb => storage.get(0, { offset: 6, length: 4 }, cb))();
      expect(data2).toEqual(Buffer.from('6789'));

      // Read last 4 bytes
      const data3 = await promisify(cb => storage.get(0, { offset: 12, length: 4 }, cb))();
      expect(data3).toEqual(Buffer.from('cdef'));
    } finally {
      await promisify(cb => storage.destroy(cb))();
    }
  });

  it('should work with Buffer encryption key', async () => {
    const keyBuffer = randomBytes(32);
    const storage = new EncryptedChunkStore(chunkLength, {
      encryptionKey: keyBuffer,
    });
    const testData = Buffer.from('buffer key test ');

    try {
      await promisify(cb => storage.put(0, testData, cb))();

      const data = await promisify(cb => storage.get(0, cb))();
      expect(data).toEqual(testData);
    } finally {
      await promisify(cb => storage.destroy(cb))();
    }
  });

  describe('Encryption with multiple files', () => {
    it('should handle encryption with multiple backing files', async () => {
      const files = [
        { path: 'file1', length: 20 },
        { path: 'file2', length: 20 },
      ];

      const storage = new EncryptedChunkStore(chunkLength, {
        encryptionKey,
        files,
        length: 40,
      });

      const testData1 = Buffer.from('first chunk data');
      const testData2 = Buffer.from('second chunkdata');

      try {
        await promisify(cb => storage.put(0, testData1, cb))();
        await promisify(cb => storage.put(1, testData2, cb))();

        const data0 = await promisify(cb => storage.get(0, cb))();
        expect(data0).toEqual(testData1);

        const data1 = await promisify(cb => storage.get(1, cb))();
        expect(data1).toEqual(testData2);
      } finally {
        await promisify(cb => storage.destroy(cb))();
      }
    });

    it('should decrypt subset of file correctly', async () => {
      const chunkLength = 32;
      const files = [
        { path: 'file1', length: 16 },
        { path: 'file2', length: 800 },
        { path: 'file3', length: 800 },
        { path: 'file4', length: 800 },
        { path: 'file5', length: 784 },
      ];
      const storage = new EncryptedChunkStore(chunkLength, {
        path: TMP_DIR,
        encryptionKey,
        length: 3200,
        files,
      });
      const testData = Buffer.from(Array.from({ length: 100 * chunkLength }, (_, i) => i % 256)); // Sequential 0-255 repeating pattern

      const putPromises = Array.from({ length: 100 }).map((_, i) => {
        const start = i * chunkLength;
        const end = Math.min(start + chunkLength, testData.length);
        const chunkData = testData.subarray(start, end);
        return promisify<void>(cb => storage.put(i, chunkData, cb))();
      });

      try {
        await Promise.all(putPromises);
        const data = await promisify(cb => storage.get(0, { offset: 18, length: 8 }, cb))();

        expect(data).toEqual(testData.subarray(18, 18 + 8));
      } finally {
        await promisify(cb => storage.destroy(cb))();
      }
    });
  });

  describe('No encryption (backward compatibility)', () => {
    it('should require encryption key - no backward compatibility', () => {
      expect(() => {
        // @ts-expect-error - Intentionally testing missing required parameter
        new EncryptedChunkStore(chunkLength); // No encryption key
      }).toThrow('Encryption key is required for encrypted chunk store');
    });
  });

  describe('Error handling', () => {
    it('should throw error for missing encryption key', () => {
      expect(() => {
        // @ts-expect-error - Intentionally testing missing required parameter
        new EncryptedChunkStore(chunkLength);
      }).toThrow('Encryption key is required for encrypted chunk store');
    });

    it('should throw error for invalid encryption key type', () => {
      expect(() => {
        // @ts-expect-error - Intentionally testing invalid type
        new EncryptedChunkStore(chunkLength, { encryptionKey: 123 });
      }).toThrow('Encryption key must be a string or Buffer');
    });

    it('should throw error for invalid Buffer length', () => {
      expect(() => {
        new EncryptedChunkStore(chunkLength, { encryptionKey: Buffer.alloc(16) }); // Too short
      }).toThrow('Encryption key buffer must be exactly 32 bytes for AES-256');
    });
  });
});
