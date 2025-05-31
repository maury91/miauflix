import fs from 'fs';
import path from 'path';

import { runAbstractTests } from '../abstract-chunk-store/create-test-suite';
import FSChunkStore from './fs-chunk-store';

// Helper function to promisify callback-based operations
const promisify = <T>(fn: (cb: (err: Error | null, result?: T) => void) => void): Promise<T> => {
  return new Promise((resolve, reject) => {
    fn((err, result) => {
      if (err) reject(err);
      else resolve(result!);
    });
  });
};

const TMP_FILE = 'tmp/test_file';

describe('Filesystem chunk store', () => {
  let store: FSChunkStore;

  afterEach(async () => {
    if (store) {
      try {
        await promisify<void>(cb => store.destroy(cb));
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // Run abstract tests with single backing file
  runAbstractTests(
    chunkLength => new FSChunkStore(chunkLength, { path: TMP_FILE }),
    'single backing file'
  );

  // Run abstract tests with random temp file
  runAbstractTests(chunkLength => new FSChunkStore(chunkLength), 'random temp file');

  // Run abstract tests with multiple backing files
  runAbstractTests(
    chunkLength =>
      new FSChunkStore(chunkLength, {
        files: [
          { path: 'tmp/multi1', length: 500 },
          { path: 'tmp/multi2', length: 500 },
        ],
      }),
    'multiple backing files'
  );

  describe('length option', () => {
    test('base', async () => {
      const tmpFile = path.join('tmp', 'length-option-test');
      store = new FSChunkStore(10, { length: 20, path: tmpFile });

      await promisify<void>(cb => store.put(0, Buffer.from('0123456789'), cb));
      expect(fs.readFileSync(tmpFile).subarray(0, 10)).toEqual(Buffer.from('0123456789'));

      await promisify<void>(cb => store.put(1, Buffer.from('1234567890'), cb));
      expect(fs.readFileSync(tmpFile)).toEqual(Buffer.from('01234567891234567890'));

      const chunk0 = await promisify<Buffer>(cb => store.get(0, undefined, cb));
      expect(chunk0).toEqual(Buffer.from('0123456789'));

      const chunk1 = await promisify<Buffer>(cb => store.get(1, undefined, cb));
      expect(chunk1).toEqual(Buffer.from('1234567890'));
      expect(fs.readFileSync(tmpFile)).toEqual(Buffer.from('01234567891234567890'));

      await promisify<void>(cb => store.destroy(cb));
      expect(() => fs.readFileSync(tmpFile)).toThrow();
    });

    test('less than chunk size', async () => {
      const tmpFile = path.join('tmp', 'length-less-than-chunk');
      store = new FSChunkStore(10, { length: 7, path: tmpFile });

      await promisify<void>(cb => store.put(0, Buffer.from('0123456'), cb));
      expect(fs.readFileSync(tmpFile)).toEqual(Buffer.from('0123456'));

      const chunk = await promisify<Buffer>(cb => store.get(0, undefined, cb));
      expect(chunk).toEqual(Buffer.from('0123456'));

      await promisify<void>(cb => store.destroy(cb));
      expect(() => fs.readFileSync(tmpFile)).toThrow();
    });

    test('less than chunk size, write too large', async () => {
      const tmpFile = path.join('tmp', 'length-write-too-large');
      store = new FSChunkStore(10, { length: 7, path: tmpFile });

      await expect(
        promisify<void>(cb => store.put(0, Buffer.from('0123456789'), cb))
      ).rejects.toThrow();

      await promisify<void>(cb => store.destroy(cb));
      expect(() => fs.readFileSync(tmpFile)).toThrow();
    });

    test('length option: less than chunk size, get `offset` too large', async () => {
      const tmpFile = path.join('tmp', 'length-offset-too-large');
      store = new FSChunkStore(10, { length: 7, path: tmpFile });

      await promisify<void>(cb => store.put(0, Buffer.from('0123456'), cb));
      expect(fs.readFileSync(tmpFile)).toEqual(Buffer.from('0123456'));

      await expect(promisify<Buffer>(cb => store.get(0, { offset: 8 }, cb))).rejects.toThrow();

      await promisify<void>(cb => store.destroy(cb));
      expect(() => fs.readFileSync(tmpFile)).toThrow();
    });

    test('length option: less than chunk size, get `length` too large', async () => {
      const tmpFile = path.join('tmp', 'length-length-too-large');
      store = new FSChunkStore(10, { length: 7, path: tmpFile });

      await promisify<void>(cb => store.put(0, Buffer.from('0123456'), cb));
      expect(fs.readFileSync(tmpFile)).toEqual(Buffer.from('0123456'));

      await expect(promisify<Buffer>(cb => store.get(0, { length: 8 }, cb))).rejects.toThrow();

      await promisify<void>(cb => store.destroy(cb));
      expect(() => fs.readFileSync(tmpFile)).toThrow();
    });

    test('length option: less than chunk size, get `offset + length` too large', async () => {
      const tmpFile = path.join('tmp', 'length-offset-plus-length-too-large');
      store = new FSChunkStore(10, { length: 7, path: tmpFile });

      await promisify<void>(cb => store.put(0, Buffer.from('0123456'), cb));
      expect(fs.readFileSync(tmpFile)).toEqual(Buffer.from('0123456'));

      await expect(
        promisify<Buffer>(cb => store.get(0, { offset: 4, length: 4 }, cb))
      ).rejects.toThrow();

      await promisify<void>(cb => store.destroy(cb));
      expect(() => fs.readFileSync(tmpFile)).toThrow();
    });
  });

  describe('multiple files tests', () => {
    test('should handle multiple files correctly', async () => {
      store = new FSChunkStore(10, {
        files: [
          { path: 'tmp/file1', length: 5 },
          { path: 'tmp/file2', length: 5 },
          { path: 'tmp2/file3', length: 8 },
          { path: 'tmp2/file4', length: 8 },
        ],
      });

      // First chunk
      await promisify<void>(cb => store.put(0, Buffer.from('0123456789'), cb));
      expect(fs.readFileSync('tmp/file1')).toEqual(Buffer.from('01234'));
      expect(fs.readFileSync('tmp/file2')).toEqual(Buffer.from('56789'));

      const chunk0 = await promisify<Buffer>(cb => store.get(0, undefined, cb));
      expect(chunk0).toEqual(Buffer.from('0123456789'));

      // Second chunk
      await promisify<void>(cb => store.put(1, Buffer.from('abcdefghij'), cb));
      expect(fs.readFileSync('tmp2/file3')).toEqual(Buffer.from('abcdefgh'));

      const chunk1 = await promisify<Buffer>(cb => store.get(1, undefined, cb));
      expect(chunk1).toEqual(Buffer.from('abcdefghij'));

      // Third chunk
      await promisify<void>(cb => store.put(2, Buffer.from('klmnop'), cb));
      expect(fs.readFileSync('tmp2/file4')).toEqual(Buffer.from('ijklmnop'));

      const chunk2 = await promisify<Buffer>(cb => store.get(2, undefined, cb));
      expect(chunk2).toEqual(Buffer.from('klmnop'));

      await promisify<void>(cb => store.destroy(cb));
    });
  });

  describe('relative path tests', () => {
    test('should handle relative path', async () => {
      store = new FSChunkStore(10, {
        files: [
          { path: 'file1', length: 5 },
          { path: 'file2', length: 5 },
        ],
        path: 'tmp',
      });

      await promisify<void>(cb => store.put(0, Buffer.from('0123456789'), cb));
      expect(fs.readFileSync('tmp/file1')).toEqual(Buffer.from('01234'));
      expect(fs.readFileSync('tmp/file2')).toEqual(Buffer.from('56789'));

      await promisify<void>(cb => store.destroy(cb));
    });

    test('should handle relative path with name', async () => {
      store = new FSChunkStore(10, {
        files: [
          { path: 'file1', length: 5 },
          { path: 'file2', length: 5 },
        ],
        name: 'folder',
        path: 'tmp',
      });

      await promisify<void>(cb => store.put(0, Buffer.from('0123456789'), cb));
      expect(fs.readFileSync('tmp/file1')).toEqual(Buffer.from('01234'));
      expect(fs.readFileSync('tmp/file2')).toEqual(Buffer.from('56789'));

      await promisify<void>(cb => store.destroy(cb));
    });

    test('should handle UID on relative path', async () => {
      store = new FSChunkStore(10, {
        files: [
          { path: 'file1', length: 5 },
          { path: 'file2', length: 5 },
        ],
        addUID: true,
        name: 'folder',
        path: 'tmp',
      });

      await promisify<void>(cb => store.put(0, Buffer.from('0123456789'), cb));
      expect(fs.readFileSync('tmp/folder/file1')).toEqual(Buffer.from('01234'));
      expect(fs.readFileSync('tmp/folder/file2')).toEqual(Buffer.from('56789'));

      await promisify<void>(cb => store.destroy(cb));
    });
  });
});
