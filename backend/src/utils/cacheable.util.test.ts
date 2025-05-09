import { beforeEach, describe, expect, it } from "bun:test";

import { Cacheable } from "./cacheable.util";

describe("Cacheable", () => {
  // Simple in-memory cache for testing
  // Shared store for the test cache
  let store: Map<string, unknown>;
  const testCache = () => ({
    async get<T>(key: string): Promise<T | null> {
      return store.has(key) ? (store.get(key) as T) : null;
    },
    async set<T>(key: string, value: T): Promise<T> {
      store.set(key, value);
      return value;
    },
  });

  beforeEach(() => {
    store = new Map();
  });

  class TestClass {
    count = 0;
    @Cacheable(1000, false, testCache())
    async getValue(x: number) {
      this.count++;
      return x * 2;
    }
  }

  it("caches the result for the same arguments", async () => {
    const obj = new TestClass();
    const v1 = await obj.getValue(2);
    const v2 = await obj.getValue(2);
    expect(v1).toBe(4);
    expect(v2).toBe(4);
    expect(obj.count).toBe(1);
  });

  it("does not cache for different arguments", async () => {
    const obj = new TestClass();
    await obj.getValue(2);
    await obj.getValue(3);
    expect(obj.count).toBe(2);
  });
});
