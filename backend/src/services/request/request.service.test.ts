jest.mock('@logger');

import type { ConfigService } from '@mytypes/configuration';
import { StatsService } from '@services/stats/stats.service';

import { RequestService } from './request.service';

describe('RequestService response limits', () => {
  const config = {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;

  let fetchSpy: jest.SpyInstance;
  let requestService: RequestService;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchSpy = jest.spyOn(global, 'fetch');
    requestService = new RequestService(new StatsService(), config);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.useRealTimers();
  });

  it('rejects a response whose declared size exceeds the configured limit', async () => {
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

  it('bounds the original response when a FlareSolverr response is oversized', async () => {
    const configGet = config.get as unknown as jest.Mock;
    configGet.mockImplementation((key: string) => {
      if (key === 'ENABLE_FLARESOLVERR') return true as never;
      if (key === 'FLARESOLVERR_URL') return 'https://solver.example' as never;
      return undefined as never;
    });
    fetchSpy
      .mockResolvedValueOnce(new Response('012345678', { status: 403 }))
      .mockResolvedValueOnce(
        Response.json({
          status: 'ok',
          solution: {
            status: 200,
            headers: {},
            response: '012345678',
            cookies: [],
          },
        })
      );

    await expect(
      requestService.request('https://example.com/file', { maxResponseBytes: 8 })
    ).rejects.toMatchObject({ code: 'response_too_large' });
  });

  it('clears the request timeout when FlareSolverr returns early', async () => {
    const configGet = config.get as unknown as jest.Mock;
    configGet.mockImplementation((key: string) => {
      if (key === 'ENABLE_FLARESOLVERR') return true as never;
      if (key === 'FLARESOLVERR_URL') return 'https://solver.example' as never;
      return undefined as never;
    });
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 403 })).mockResolvedValueOnce(
      Response.json({
        status: 'ok',
        solution: { status: 200, headers: {}, response: '{}', cookies: [] },
      })
    );

    await requestService.request('https://example.com/file', { timeout: 5000 });
    expect(jest.getTimerCount()).toBe(0);
  });
});
