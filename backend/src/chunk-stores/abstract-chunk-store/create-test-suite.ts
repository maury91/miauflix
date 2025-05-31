import type AbstractChunkStore from './abstract-chunk-store';

// Helper function to promisify callback-based operations
const promisify = <T>(fn: (cb: (err: Error | null, result?: T) => void) => void): Promise<T> => {
  return new Promise((resolve, reject) => {
    fn((err, result) => {
      if (err) reject(err);
      else resolve(result!);
    });
  });
};
// Utility to create test buffers
const makeBuffer = (num: number): Buffer => {
  const buf = Buffer.alloc(10);
  buf.fill(num);
  return buf;
};

// Abstract tests function equivalent - TypeScript + Jest version
export const runAbstractTests = (
  createStore: (chunkLength: number) => AbstractChunkStore,
  testSuiteName: string
) => {
  describe(`Abstract Tests: ${testSuiteName}`, () => {
    let store: AbstractChunkStore;

    afterEach(async () => {
      if (store) {
        try {
          await promisify<void>(cb => store.destroy(cb));
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    test('basic put, then get', async () => {
      store = createStore(10);
      await promisify<void>(cb => store.put(0, Buffer.from('0123456789'), cb));
      const chunk = await promisify<Buffer>(cb => store.get(0, cb));
      expect(chunk).toEqual(Buffer.from('0123456789'));
    });

    test('put invalid chunk length gives error', async () => {
      store = createStore(10);
      await expect(promisify<void>(cb => store.put(0, Buffer.from('0123'), cb))).rejects.toThrow();
    });

    test('concurrent puts, then concurrent gets', async () => {
      store = createStore(10);

      // Create put tasks
      const putTasks = Array.from({ length: 100 }, (_, i) =>
        promisify<void>(cb => store.put(i, makeBuffer(i), cb))
      );

      // Execute all puts concurrently
      await Promise.all(putTasks);

      // Create get tasks
      const getTasks = Array.from({ length: 100 }, async (_, i) => {
        const data = await promisify<Buffer>(cb => store.get(i, cb));
        expect(data).toEqual(makeBuffer(i));
      });

      // Execute all gets concurrently
      await Promise.all(getTasks);
    });

    test('interleaved puts and gets', async () => {
      store = createStore(10);

      const tasks = Array.from({ length: 100 }, async (_, i) => {
        await promisify<void>(cb => store.put(i, makeBuffer(i), cb));
        const data = await promisify<Buffer>(cb => store.get(i, cb));
        expect(data).toEqual(makeBuffer(i));
      });

      await Promise.all(tasks);
    });

    test('get with `offset` and `length` options', async () => {
      store = createStore(10);
      await promisify<void>(cb => store.put(0, Buffer.from('0123456789'), cb));
      const chunk = await promisify<Buffer>(cb => store.get(0, { offset: 2, length: 3 }, cb));
      expect(chunk).toEqual(Buffer.from('234'));
    });

    test('get with null option', async () => {
      store = createStore(10);
      await promisify<void>(cb => store.put(0, Buffer.from('0123456789'), cb));
      const chunk = await promisify<Buffer>(cb => store.get(0, null, cb));
      expect(chunk).toEqual(Buffer.from('0123456789'));
    });

    test('get with empty object option', async () => {
      store = createStore(10);
      await promisify<void>(cb => store.put(0, Buffer.from('0123456789'), cb));
      const chunk = await promisify<Buffer>(cb => store.get(0, {}, cb));
      expect(chunk).toEqual(Buffer.from('0123456789'));
    });

    test('get with `offset` option', async () => {
      store = createStore(10);
      await promisify<void>(cb => store.put(0, Buffer.from('0123456789'), cb));
      const chunk = await promisify<Buffer>(cb => store.get(0, { offset: 2 }, cb));
      expect(chunk).toEqual(Buffer.from('23456789'));
    });

    test('get with `length` option', async () => {
      store = createStore(10);
      await promisify<void>(cb => store.put(0, Buffer.from('0123456789'), cb));
      const chunk = await promisify<Buffer>(cb => store.get(0, { length: 5 }, cb));
      expect(chunk).toEqual(Buffer.from('01234'));
    });

    test('test for sparsely populated support', async () => {
      store = createStore(10);
      await promisify<void>(cb => store.put(10, Buffer.from('0123456789'), cb));
      const chunk = await promisify<Buffer>(cb => store.get(10, undefined, cb));
      expect(chunk).toEqual(Buffer.from('0123456789'));
    });

    test('test `put` without callback - error should be silent', async () => {
      store = createStore(10);
      // This should not throw, even with invalid data
      store.put(0, Buffer.from('01234'));
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to let operation complete
    });

    test('test `put` without callback - success should be silent', async () => {
      store = createStore(10);
      // This should not throw with valid data
      store.put(0, Buffer.from('0123456789'));
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to let operation complete
    });

    test('chunkLength property', async () => {
      store = createStore(10);
      expect(store.chunkLength).toBe(10);
    });

    test('test `get` on non-existent index', async () => {
      store = createStore(10);
      await expect(promisify<Buffer>(cb => store.get(0, undefined, cb))).rejects.toThrow();
    });

    test("test empty store's `close` calls its callback", async () => {
      store = createStore(10);
      await promisify<void>(cb => store.close(cb));
    });

    test("test non-empty store's `close` calls its callback", async () => {
      store = createStore(10);
      store.put(0, Buffer.from('0123456789'));
      await promisify<void>(cb => store.close(cb));
    });
  });
};
