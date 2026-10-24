import { randomBytes } from 'crypto';
import fs from 'fs';
import { readdir, readFile, rm, unlink } from 'fs/promises';
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

  describe('Removing single files', () => {
    const files = [
      { path: 'pack/a.mkv', length: 6 },
      { path: 'pack/b.mkv', length: 10 },
    ];
    const dir = path.join(TMP_DIR, 'remove_single_files');

    const open = () =>
      new EncryptedChunkStore(4, { path: dir, encryptionKey, files: files.map(f => ({ ...f })) });
    const put = (store: EncryptedChunkStore, index: number, data: Buffer) =>
      promisify<void>(cb => store.put(index, data, cb))();
    const get = (store: EncryptedChunkStore, index: number) =>
      new Promise<Buffer>((resolve, reject) =>
        store.get(index, (error, buffer) => (error ? reject(error) : resolve(buffer!)))
      );
    const fill = async (store: EncryptedChunkStore) => {
      const bytes = Buffer.from('AAAAAABBBBBBBBBB');
      for (let i = 0; i * 4 < bytes.length; i++)
        await put(store, i, bytes.subarray(i * 4, i * 4 + 4));
    };

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('deletes only the named encrypted files and keeps the store usable', async () => {
      const store = open();
      try {
        await fill(store);
        expect(await readdir(dir)).toHaveLength(2);

        await store.removeFiles(['pack/a.mkv']);

        expect(await readdir(dir)).toHaveLength(1);
        // b.mkv keeps its fully owned chunks readable.
        const owned = await get(store, 2);
        expect(owned.toString()).toBe('BBBB');

        // Writing the shared chunk again recreates the removed file.
        await put(store, 1, Buffer.from('AABB'));
        expect(await readdir(dir)).toHaveLength(2);
        const shared = await get(store, 1);
        expect(shared.toString()).toBe('AABB');
      } finally {
        await promisify(cb => store.close(cb))().catch(() => undefined);
      }
    });

    it('keeps writes that race a removal: no error, and data written after it is readable', async () => {
      const store = open();
      try {
        await fill(store);

        // A write already in flight when the removal starts, and writes that arrive during it.
        const inFlight = put(store, 0, Buffer.from('XXXX'));
        const removal = store.removeFiles(['pack/a.mkv']);
        const during = Promise.all([
          put(store, 0, Buffer.from('ZZZZ')),
          put(store, 1, Buffer.from('ZZBB')),
        ]);
        await expect(Promise.all([inFlight, removal, during])).resolves.toBeDefined();

        // Writes after the removal went to a fresh file, not to a handle on the unlinked one.
        expect((await get(store, 0)).toString()).toBe('ZZZZ');
        expect((await get(store, 1)).toString()).toBe('ZZBB');
        expect(await readdir(dir)).toHaveLength(2);
        // Nothing was lost to an unlinked inode: a new store reads the same bytes from disk.
        await promisify(cb => store.close(cb))();
        const reopened = open();
        try {
          expect((await get(reopened, 0)).toString()).toBe('ZZZZ');
        } finally {
          await promisify(cb => reopened.close(cb))().catch(() => undefined);
        }
      } finally {
        await promisify(cb => store.close(cb))().catch(() => undefined);
      }
    });

    it('removes files that were never written without failing', async () => {
      const store = open();
      try {
        await expect(store.removeFiles(['pack/a.mkv', 'pack/b.mkv'])).resolves.toBeUndefined();
      } finally {
        await promisify(cb => store.close(cb))().catch(() => undefined);
      }
    });

    it('does not delete a physical file that a kept path shares', async () => {
      // Two paths with the same base name map to one encrypted file.
      const twins = new EncryptedChunkStore(4, {
        path: dir,
        encryptionKey,
        files: [
          { path: 'one/readme.txt', length: 4 },
          { path: 'two/readme.txt', length: 4 },
        ],
      });
      try {
        await put(twins, 0, Buffer.from('DATA'));
        await twins.removeFiles(['one/readme.txt']);
        expect(await readdir(dir)).toHaveLength(1);
      } finally {
        await promisify(cb => twins.close(cb))().catch(() => undefined);
      }
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
