import { createCipheriv, createHash, createHmac, randomBytes } from 'crypto';
import fs from 'fs';
import { readdir, readFile, rm, stat, unlink } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import EncryptedChunkStore, {
  paddedLength,
} from '../../../src/chunk-stores/encrypted-chunk-store/encrypted-chunk-store';
import { runAbstractTests } from '../abstract-chunk-store/create-test-suite';

const encryptionKey = 'test-key-123';
const TMP_DIR = 'tmp';
/** Current-version options: v2 needs per-store name and content salts. */
const V2 = {
  encryptionVersion: 2 as const,
  filenameSalt: 'test-salt',
  contentSalt: 'test-content',
};

// Run abstract tests with single backing file
runAbstractTests(
  chunkLength => new EncryptedChunkStore(chunkLength, { encryptionKey, ...V2 }),
  'single backing file'
);

// Run abstract tests on the legacy format too, which old downloads still use
runAbstractTests(
  chunkLength => new EncryptedChunkStore(chunkLength, { encryptionKey, encryptionVersion: 1 }),
  'legacy v1 format'
);

// Run abstract tests with random temp file
runAbstractTests(
  chunkLength => new EncryptedChunkStore(chunkLength, { encryptionKey, ...V2 }),
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
      ...V2,
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
        ...V2,
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
    const storage = new EncryptedChunkStore(chunkLength, { encryptionKey, ...V2 });
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
    const storage = new EncryptedChunkStore(chunkLength, { encryptionKey, ...V2 });
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
      ...V2,
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
        ...V2,
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
        ...V2,
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
      new EncryptedChunkStore(4, {
        path: dir,
        encryptionKey,
        ...V2,
        files: files.map(f => ({ ...f })),
      });
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

    it('v1: does not delete a physical file that a kept path shares', async () => {
      // In version 1, two paths with the same base name map to one encrypted file.
      const twins = new EncryptedChunkStore(4, {
        path: dir,
        encryptionKey,
        encryptionVersion: 1,
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

    it('v2: files with the same base name in different folders stay apart', async () => {
      const twins = new EncryptedChunkStore(4, {
        path: dir,
        encryptionKey,
        ...V2,
        files: [
          { path: 'one/readme.txt', length: 4 },
          { path: 'two/readme.txt', length: 4 },
        ],
      });
      try {
        await put(twins, 0, Buffer.from('ONE!'));
        await put(twins, 1, Buffer.from('TWO!'));
        expect(await readdir(dir)).toHaveLength(2);
        expect(await get(twins, 0)).toEqual(Buffer.from('ONE!'));
        await twins.removeFiles(['one/readme.txt']);
        expect(await readdir(dir)).toHaveLength(1);
        expect(await get(twins, 1)).toEqual(Buffer.from('TWO!'));
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
        new EncryptedChunkStore(chunkLength, { encryptionKey: Buffer.alloc(16), ...V2 }); // Too short
      }).toThrow('Encryption key buffer must be exactly 32 bytes for AES-256');
    });
  });
});

describe('Encryption versions', () => {
  const key = 'version-test-key';
  const sha256Key = createHash('sha256').update(key).digest();
  const put = (store: EncryptedChunkStore, index: number, data: Buffer) =>
    promisify<void>(cb => store.put(index, data, cb))();
  const get = (store: EncryptedChunkStore, index: number) =>
    new Promise<Buffer>((resolve, reject) =>
      store.get(index, (error, buffer) => (error ? reject(error) : resolve(buffer!)))
    );
  /** Store contents as written to disk: one backing file, read back raw. */
  const rawStore = async (
    dir: string,
    chunkLength: number,
    chunks: Buffer[],
    options: { encryptionVersion: 1 | 2; filenameSalt?: string; contentSalt?: string }
  ): Promise<{ store: EncryptedChunkStore; raw: Buffer }> => {
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const store = new EncryptedChunkStore(chunkLength, {
      path: dir,
      encryptionKey: key,
      files: [{ path: 'file.bin', length }],
      ...options,
    });
    for (const [index, chunk] of chunks.entries()) await put(store, index, chunk);
    const [name] = await readdir(dir);
    return { store, raw: await readFile(path.join(dir, name)) };
  };
  const ctr = (cipherKey: Buffer, iv: Buffer, data: Buffer) => {
    const cipher = createCipheriv('aes-256-ctr', cipherKey, iv);
    return Buffer.concat([cipher.update(data), cipher.final()]);
  };
  const ivAtBlock = (block: number) => {
    const iv = Buffer.alloc(16);
    iv.writeUInt32BE(block, 12);
    return iv;
  };

  const dirs: string[] = [];
  const freshDir = (name: string) => {
    const dir = path.join(TMP_DIR, `versions_${name}_${randomBytes(4).toString('hex')}`);
    dirs.push(dir);
    return dir;
  };
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
  });

  it('v1 keeps the legacy bytes on disk, so files written before versions stay readable', async () => {
    const chunks = [randomBytes(32), randomBytes(32)];
    const { store, raw } = await rawStore(freshDir('v1_format'), 32, chunks, {
      encryptionVersion: 1,
      filenameSalt: 'download-abc',
    });
    try {
      // The legacy scheme: SHA-256 of the key string, counter block = chunk index.
      expect(raw.subarray(0, 32)).toEqual(ctr(sha256Key, ivAtBlock(0), chunks[0]));
      expect(raw.subarray(32, 64)).toEqual(ctr(sha256Key, ivAtBlock(1), chunks[1]));
      expect(await get(store, 1)).toEqual(chunks[1]);
    } finally {
      await promisify(cb => store.destroy(cb))();
    }
  });

  it('v2 encrypts the store as one keystream, under a key derived from its content salt', async () => {
    const chunks = [randomBytes(32), randomBytes(32), randomBytes(32)];
    const { store, raw } = await rawStore(freshDir('v2_format'), 32, chunks, {
      encryptionVersion: 2,
      filenameSalt: 'download-abc',
      contentSalt: 'content-abc',
    });
    try {
      const storeKey = createHmac('sha256', sha256Key)
        .update('miauflix-chunk-store-v2-content:content-abc', 'utf8')
        .digest();
      expect(raw).toEqual(ctr(storeKey, Buffer.alloc(16), Buffer.concat(chunks)));
      for (const [index, chunk] of chunks.entries()) expect(await get(store, index)).toEqual(chunk);
    } finally {
      await promisify(cb => store.destroy(cb))();
    }
  });

  it('v2 never reuses keystream between neighbouring chunks (v1 did)', async () => {
    const zeros = [Buffer.alloc(32), Buffer.alloc(32)];
    const v1 = await rawStore(freshDir('v1_overlap'), 32, zeros, {
      encryptionVersion: 1,
      filenameSalt: 'download-abc',
    });
    const v2 = await rawStore(freshDir('v2_overlap'), 32, zeros, {
      encryptionVersion: 2,
      filenameSalt: 'download-abc',
      contentSalt: 'content-abc',
    });
    try {
      // Encrypting zeros writes the keystream itself: chunk 1's first block is chunk 0's second.
      expect(v1.raw.subarray(32, 48)).toEqual(v1.raw.subarray(16, 32));
      const blocks = new Set(
        Array.from({ length: 4 }, (_, i) => v2.raw.subarray(i * 16, i * 16 + 16).toString('hex'))
      );
      expect(blocks.size).toBe(4);
    } finally {
      await promisify(cb => v1.store.destroy(cb))();
      await promisify(cb => v2.store.destroy(cb))();
    }
  });

  it('v2 gives every store its own keystream (v1 shared one)', async () => {
    const zeros = [Buffer.alloc(32)];
    const write = (version: 1 | 2, salt: string) =>
      rawStore(freshDir(`v${version}_${salt}`), 32, zeros, {
        encryptionVersion: version,
        filenameSalt: salt,
        ...(version === 2 ? { contentSalt: `content-${salt}` } : {}),
      });
    const [v1a, v1b, v2a, v2b] = await Promise.all([
      write(1, 'download-a'),
      write(1, 'download-b'),
      write(2, 'download-a'),
      write(2, 'download-b'),
    ]);
    try {
      expect(v1a.raw).toEqual(v1b.raw);
      expect(v2a.raw).not.toEqual(v2b.raw);
    } finally {
      for (const { store } of [v1a, v1b, v2a, v2b]) await promisify(cb => store.destroy(cb))();
    }
  });

  it('v2 names files with a keyed hash of the whole path, not the plain-hash v1 name', async () => {
    const dir = freshDir('v2_names');
    const { store } = await rawStore(dir, 32, [Buffer.alloc(32)], {
      encryptionVersion: 2,
      filenameSalt: 'download-abc',
      contentSalt: 'content-abc',
    });
    try {
      const expected = createHmac('sha256', sha256Key)
        .update('miauflix-chunk-store-v2-name:download-abc\0file.bin', 'utf8')
        .digest('hex')
        .substring(0, 24);
      expect(await readdir(dir)).toEqual([expected]);
    } finally {
      await promisify(cb => store.destroy(cb))();
    }
  });

  it('v2 handles chunks that start mid-block', async () => {
    // 20-byte chunks: chunk 1 starts 4 bytes into the second AES block.
    const chunks = [randomBytes(20), randomBytes(20), randomBytes(20)];
    const { store, raw } = await rawStore(freshDir('v2_unaligned'), 20, chunks, {
      encryptionVersion: 2,
      filenameSalt: 'download-abc',
      contentSalt: 'content-abc',
    });
    try {
      const storeKey = createHmac('sha256', sha256Key)
        .update('miauflix-chunk-store-v2-content:content-abc', 'utf8')
        .digest();
      expect(raw).toEqual(ctr(storeKey, Buffer.alloc(16), Buffer.concat(chunks)));
      expect(await get(store, 1)).toEqual(chunks[1]);
      const partial = await new Promise<Buffer>((resolve, reject) =>
        store.get(2, { offset: 7, length: 9 }, (error, buffer) =>
          error ? reject(error) : resolve(buffer!)
        )
      );
      expect(partial).toEqual(chunks[2].subarray(7, 16));
    } finally {
      await promisify(cb => store.destroy(cb))();
    }
  });

  it('a store opened with the wrong version does not read the data', async () => {
    const dir = freshDir('mismatch');
    const chunk = Buffer.from('0123456789abcdef0123456789abcdef');
    const { store } = await rawStore(dir, 32, [chunk], {
      encryptionVersion: 1,
      filenameSalt: 'download-abc',
    });
    await promisify(cb => store.close(cb))();
    const reader = new EncryptedChunkStore(32, {
      path: dir,
      encryptionKey: key,
      files: [{ path: 'file.bin', length: 32 }],
      encryptionVersion: 2,
      filenameSalt: 'download-abc',
      contentSalt: 'content-abc',
    });
    try {
      // v2 names files differently, and decrypts differently: either way, no data.
      const result = await get(reader, 0).catch(() => null);
      expect(result).not.toEqual(chunk);
    } finally {
      await promisify(cb => reader.close(cb))();
    }
  });

  it('v2 refuses to run without both per-store salts', () => {
    const message = 'Encryption version 2 requires per-store filenameSalt and contentSalt';
    expect(() => new EncryptedChunkStore(32, { encryptionKey: key, encryptionVersion: 2 })).toThrow(
      message
    );
    expect(
      () =>
        new EncryptedChunkStore(32, {
          encryptionKey: key,
          encryptionVersion: 2,
          filenameSalt: 'download-abc',
        })
    ).toThrow(message);
  });

  it('v2 keys content by the content salt alone, and names by the name salt alone', async () => {
    const chunk = [Buffer.alloc(32)];
    const write = (filenameSalt: string, contentSalt: string) =>
      rawStore(freshDir(`split_${filenameSalt}_${contentSalt}`), 32, chunk, {
        encryptionVersion: 2,
        filenameSalt,
        contentSalt,
      });
    const base = await write('name-1', 'content-1');
    const otherName = await write('name-2', 'content-1');
    const otherContent = await write('name-1', 'content-2');
    try {
      expect(otherName.raw).toEqual(base.raw);
      expect(otherContent.raw).not.toEqual(base.raw);
      const names = await Promise.all(
        [base, otherName, otherContent].map(({ store }) => readdir(store.path!))
      );
      expect(names[1]).not.toEqual(names[0]);
      expect(names[2]).toEqual(names[0]);
    } finally {
      for (const { store } of [base, otherName, otherContent])
        await promisify(cb => store.destroy(cb))();
    }
  });

  it('refuses an unknown version', () => {
    expect(
      () =>
        new EncryptedChunkStore(32, {
          encryptionKey: key,
          encryptionVersion: 3 as unknown as 2,
          filenameSalt: 'x',
        })
    ).toThrow('Unsupported encryption version: 3');
  });
});

describe('File size padding', () => {
  const key = 'padding-test-key';
  const KIB = 1024;
  const dirs: string[] = [];
  const freshDir = (name: string) => {
    const dir = path.join(TMP_DIR, `padding_${name}_${randomBytes(4).toString('hex')}`);
    dirs.push(dir);
    return dir;
  };
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
  });
  const open = (dir: string, length: number, options: { padFiles?: boolean; v1?: boolean }) =>
    new EncryptedChunkStore(16 * KIB, {
      path: dir,
      encryptionKey: key,
      files: [{ path: 'movie.mkv', length }],
      ...(options.v1 ? { encryptionVersion: 1 as const, filenameSalt: 'download-abc' } : V2),
      padFiles: options.padFiles,
    });
  const putAll = async (store: EncryptedChunkStore, data: Buffer) => {
    for (let index = 0; index * store.chunkLength < data.length; index += 1) {
      const chunk = data.subarray(index * store.chunkLength, (index + 1) * store.chunkLength);
      await promisify<void>(cb => store.put(index, chunk, cb))();
    }
  };
  const readAll = async (store: EncryptedChunkStore, length: number) => {
    const chunks: Buffer[] = [];
    for (let index = 0; index * store.chunkLength < length; index += 1)
      chunks.push(
        await new Promise<Buffer>((resolve, reject) =>
          store.get(index, (error, buffer) => (error ? reject(error) : resolve(buffer!)))
        )
      );
    return Buffer.concat(chunks);
  };
  const fileOnDisk = async (dir: string) => {
    const [name] = await readdir(dir);
    return path.join(dir, name);
  };

  describe('paddedLength (Padmé)', () => {
    it('gives every file up to 64 KiB the same size', () => {
      expect(paddedLength(1)).toBe(64 * KIB);
      expect(paddedLength(45_123)).toBe(64 * KIB);
      expect(paddedLength(64 * KIB)).toBe(64 * KIB);
    });

    it('rounds to a step that keeps only a few significant bits', () => {
      // 2^29 <= 1e9 < 2^30: 5 significant bits, so a 2^24 step.
      expect(paddedLength(1_000_000_000)).toBe(60 * 2 ** 24);
      expect(paddedLength(60 * 2 ** 24)).toBe(60 * 2 ** 24);
    });

    it('never shrinks, costs at most 2^-5 above 64 KiB and 2^-6 from 4 GiB', () => {
      for (let length = 64 * KIB + 1; length < 2 ** 40; length = Math.ceil(length * 1.37) + 17) {
        const padded = paddedLength(length);
        expect(padded).toBeGreaterThanOrEqual(length);
        expect(padded / length).toBeLessThanOrEqual(1 + 2 ** -5);
        if (length >= 2 ** 32) expect(padded / length).toBeLessThanOrEqual(1 + 2 ** -6);
      }
    });

    it('collapses many exact sizes into few', () => {
      const sizes = new Set<number>();
      for (let length = 700 * 2 ** 20; length < 800 * 2 ** 20; length += 4093)
        sizes.add(paddedLength(length));
      // Over 25 000 exact sizes between 700 and 800 MiB become a handful.
      expect(sizes.size).toBeLessThanOrEqual(8);
    });
  });

  it('is off unless asked: files keep their exact size', async () => {
    const dir = freshDir('off');
    const data = randomBytes(100 * KIB + 3);
    const store = open(dir, data.length, {});
    try {
      await putAll(store, data);
      expect((await stat(await fileOnDisk(dir))).size).toBe(data.length);
    } finally {
      await promisify(cb => store.close(cb))();
    }
  });

  it('pads a file with random bytes as soon as it is opened, and reads back the data', async () => {
    const dir = freshDir('on');
    const data = randomBytes(100 * KIB + 3);
    const store = open(dir, data.length, { padFiles: true });
    try {
      // The last chunk first, as players fetch a file's tail early: the size must not show yet.
      const last = Math.floor((data.length - 1) / store.chunkLength);
      await promisify<void>(cb => store.put(last, data.subarray(last * store.chunkLength), cb))();
      const file = await fileOnDisk(dir);
      expect((await stat(file)).size).toBe(paddedLength(data.length));
      await putAll(store, data);
      expect(await readAll(store, data.length)).toEqual(data);
      const padding = (await readFile(file)).subarray(data.length);
      expect(padding.length).toBe(paddedLength(data.length) - data.length);
      // Random, not a hole: zeros would leave the allocated size telling the length.
      expect(padding.equals(Buffer.alloc(padding.length))).toBe(false);
    } finally {
      await promisify(cb => store.close(cb))();
    }
  });

  it('can be turned on later: an exact-size file is padded and still reads the same', async () => {
    const dir = freshDir('later');
    const data = randomBytes(90 * KIB);
    const before = open(dir, data.length, {});
    await putAll(before, data);
    await promisify(cb => before.close(cb))();
    const after = open(dir, data.length, { padFiles: true });
    try {
      expect(await readAll(after, data.length)).toEqual(data);
      expect((await stat(await fileOnDisk(dir))).size).toBe(paddedLength(data.length));
    } finally {
      await promisify(cb => after.close(cb))();
    }
    const off = open(dir, data.length, {});
    try {
      expect(await readAll(off, data.length)).toEqual(data);
    } finally {
      await promisify(cb => off.close(cb))();
    }
  });

  it('never pads version 1 files, so old downloads stay exactly as they were', async () => {
    const dir = freshDir('v1');
    const data = randomBytes(70 * KIB);
    const store = open(dir, data.length, { padFiles: true, v1: true });
    try {
      await putAll(store, data);
      expect((await stat(await fileOnDisk(dir))).size).toBe(data.length);
    } finally {
      await promisify(cb => store.close(cb))();
    }
  });
});
