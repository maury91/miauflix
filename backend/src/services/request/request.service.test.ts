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
    fetchSpy = jest.spyOn(global, 'fetch');
    requestService = new RequestService(new StatsService(), config);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
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
});
