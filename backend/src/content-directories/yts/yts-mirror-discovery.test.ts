import { MockCache } from '@__test-utils__/cache.mock';

import type { RequestServiceResponse } from '@services/request/request.service';
import { RequestService } from '@services/request/request.service';
import { StatsService } from '@services/stats/stats.service';

import { discoverYTSMirrors } from './yts-mirror-discovery';

jest.mock('@services/request/request.service');

describe('YTS Mirror Discovery', () => {
  let mockRequestService: jest.Mocked<RequestService>;

  beforeEach(() => {
    mockRequestService = new RequestService(
      new StatsService()
    ) as unknown as jest.Mocked<RequestService>;
  });

  it('should discover operational YTS domains from yifystatus.com', async () => {
    const mockResponse: RequestServiceResponse<string> = {
      body: '<html>...</html>',
      headers: { 'content-type': 'text/html' },
      ok: true,
      status: 200,
      statusText: 'OK',
    };
    mockRequestService.request.mockResolvedValue(mockResponse);
    const domains = await discoverYTSMirrors(new MockCache(), mockRequestService);

    // Should return an array of domains
    expect(Array.isArray(domains)).toBe(true);
    expect(domains.length).toBeGreaterThan(0);

    // All domains should be lowercase strings starting with 'yts.'
    domains.forEach(domain => {
      expect(typeof domain).toBe('string');
      expect(domain).toMatch(/^yts\./);
      expect(domain).toBe(domain.toLowerCase());
    });

    // Should include known operational domains
    const knownDomains = ['yts.lt', 'yts.gg', 'yts.am', 'yts.ag'];
    const foundKnownDomains = knownDomains.filter(d => domains.includes(d));
    expect(foundKnownDomains.length).toBeGreaterThan(0);
  });

  it('should cache discovered domains', async () => {
    const mockCache = new MockCache();
    const mockResponse: RequestServiceResponse<string> = {
      body: '<html>...</html>',
      headers: { 'content-type': 'text/html' },
      ok: true,
      status: 200,
      statusText: 'OK',
    };
    mockRequestService.request.mockResolvedValue(mockResponse);
    // First call should fetch and cache
    const domains1 = await discoverYTSMirrors(mockCache, mockRequestService);
    expect(domains1.length).toBeGreaterThan(0);

    // Check that cache was used
    const cacheCallCount = mockCache.getCallCount('yts:mirrors:discovered');
    expect(cacheCallCount).toBeGreaterThan(0);

    // Second call should use cache
    const domains2 = await discoverYTSMirrors(mockCache, mockRequestService);
    expect(domains2).toEqual(domains1);
  });
});
