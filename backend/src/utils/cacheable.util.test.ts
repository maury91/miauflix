import { MockCache } from '@__test-utils__/cache.mock';
import type { Cache } from 'cache-manager';

import { StatsService } from '@services/stats/stats.service';
import { Api } from '@utils/api.util';

const { Cacheable } = jest.requireActual('./cacheable.util');

// Create a test API class that extends Api
class TestApi extends Api {
  count = 0;

  constructor(cache: Cache, statsService: StatsService) {
    super(cache, statsService, 'https://test-api.com', 10);
  }

  @Cacheable(1000)
  async getValue(x: number): Promise<number> {
    this.count++;
    return x * 2;
  }

  @Cacheable(1000, true) // With reset=true
  async getValueReset(x: number): Promise<number> {
    this.count++;
    return x * 3;
  }
}

describe('Cacheable', () => {
  let mockCache: MockCache;
  let testApi: TestApi;

  beforeEach(() => {
    // Setup our mock cache and API instance
    mockCache = new MockCache();
    const statsService = new StatsService();
    // Cast to any to bypass TypeScript's strict type checking
    // In a real scenario, we'd implement the full Cache interface
    testApi = new TestApi(mockCache, statsService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('caches the result for the same arguments', async () => {
    // First call - should set cache
    const v1 = await testApi.getValue(2);

    // Second call - should use cache
    const v2 = await testApi.getValue(2);

    expect(v1).toBe(4);
    expect(v2).toBe(4);
    expect(testApi.count).toBe(1); // The method should only be called once

    // Verify cache interactions
    expect(mockCache.getCallCount()).toBe(2); // One call for each getValue
    expect(mockCache.setCallCount()).toBe(1); // Only set once after the first call
  });

  it('does not cache for different arguments', async () => {
    // First call with arg=2
    await testApi.getValue(2);

    // Second call with arg=3
    await testApi.getValue(3);

    expect(testApi.count).toBe(2); // The method should be called twice
    expect(mockCache.setCallCount()).toBe(2); // Cache set for both calls
  });

  it('ignores cache when reset=true', async () => {
    // First call
    const v1 = await testApi.getValueReset(2);

    // Second call
    const v2 = await testApi.getValueReset(2);

    expect(v1).toBe(6);
    expect(v2).toBe(6);
    expect(testApi.count).toBe(2); // Method should be called twice
    expect(mockCache.getCallCount()).toBe(2); // Cache gets checked twice
    expect(mockCache.setCallCount()).toBe(2); // Cache gets set twice
  });
});
