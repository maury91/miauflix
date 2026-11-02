jest.mock('@logger');

import { configureFakerSeed } from '@__test-utils__/utils';

import type { ConfigService } from '@mytypes/configuration';
import { StatsService } from '@services/stats/stats.service';

import { RequestService } from './request.service';

describe('RequestService response limits', () => {
  let fetchSpy: jest.SpyInstance | undefined;

  const setupTest = () => {
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    fetchSpy = jest.spyOn(global, 'fetch');
    const requestService = new RequestService(new StatsService(), config);
    return { config, fetchSpy, requestService };
  };

  beforeAll(() => {
    configureFakerSeed();
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    jest.useRealTimers();
  });

  it('rejects a response whose declared size exceeds the configured limit', async () => {
    const { fetchSpy, requestService } = setupTest();
    fetchSpy.mockResolvedValue(
      new Response('too large', {
        headers: { 'content-length': '9' },
      })
    );

    await expect(
      requestService.request('https://example.com/file', {
        asBuffer: true,
        maxResponseBytes: 8,
      })
    ).rejects.toMatchObject({ code: 'response_too_large' });
  });

  it('stops a chunked response once it crosses the configured limit', async () => {
    const { fetchSpy, requestService } = setupTest();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6));
        controller.enqueue(new Uint8Array(6));
        controller.close();
      },
    });
    fetchSpy.mockResolvedValue(new Response(body));

    await expect(
      requestService.request('https://example.com/file', {
        asBuffer: true,
        maxResponseBytes: 10,
      })
    ).rejects.toMatchObject({ code: 'response_too_large' });
  });

  it('returns a forbidden response without contacting another host', async () => {
    const { fetchSpy, requestService } = setupTest();
    fetchSpy.mockResolvedValue(new Response('blocked', { status: 403 }));
    const result = await requestService.request('https://example.com/file', { timeout: 5000 });
    expect(result.status).toBe(403);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
