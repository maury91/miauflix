import type { Cache } from 'cache-manager';

export class MockCache implements Cache {
  private store = new Map<string, unknown>();
  private mockGetFn = jest.fn();
  private mockSetFn = jest.fn();
  public mget = jest.fn();
  public mset = jest.fn();
  public mdel = jest.fn();
  public clear = jest.fn();
  public on = jest.fn();
  public off = jest.fn();
  public disconnect = jest.fn();
  public ttl = jest.fn();
  public cacheId = jest.fn();
  public stores = [];
  public wrap = jest.fn();

  async get<T>(key: string): Promise<T | null> {
    this.mockGetFn(key);
    return (this.store.get(key) as T) || null;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<T> {
    this.mockSetFn(key, value, ttl);
    this.store.set(key, value);
    return value;
  }

  async del(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async reset(): Promise<void> {
    this.store.clear();
  }

  // Helper methods for testing
  getCallCount(key?: string): number {
    if (key) {
      return this.mockGetFn.mock.calls.filter(call => call[0] === key).length;
    }
    return this.mockGetFn.mock.calls.length;
  }

  setCallCount(key?: string): number {
    if (key) {
      return this.mockSetFn.mock.calls.filter(call => call[0] === key).length;
    }
    return this.mockSetFn.mock.calls.length;
  }

  getMockGetFn() {
    return this.mockGetFn;
  }

  getMockSetFn() {
    return this.mockSetFn;
  }
}
