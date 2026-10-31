import { afterEach, describe, expect, it, vi } from 'vitest';

import { probeServer } from './probe';
import { scanSubnet } from './scan';

const health = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('probeServer', () => {
  it('accepts Miauflix servers, with or without the service name', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    fetchMock.mockResolvedValueOnce(health({ status: 'ok', service: 'miauflix' }));
    expect(await probeServer('http://a')).toBe(true);
    fetchMock.mockResolvedValueOnce(health({ status: 'ok' }));
    expect(await probeServer('http://a')).toBe(true);
    fetchMock.mockResolvedValueOnce(health({ status: 'ok', service: 'other' }));
    expect(await probeServer('http://a')).toBe(false);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await probeServer('http://a')).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://a/api/health',
      expect.objectContaining({ credentials: 'omit' })
    );
  });

  it('gives up after the timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')))
          )
      )
    );

    const result = probeServer('http://a', { timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBe(false);
    vi.useRealTimers();
  });
});

describe('scanSubnet', () => {
  it('probes the other hosts of the /24 and reports the servers that answer', async () => {
    const fetchMock = vi.fn<typeof fetch>(async input => {
      const url = String(input);
      if (
        url.startsWith('http://192.168.1.10:3000/') ||
        url.startsWith('http://192.168.1.200:3000/')
      )
        return health({ status: 'ok', service: 'miauflix' });
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    const onFound = vi.fn();

    const found = await scanSubnet('192.168.1.50', { onFound });

    expect(found.sort()).toEqual(['http://192.168.1.10:3000', 'http://192.168.1.200:3000']);
    expect(onFound).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(253);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('192.168.1.50:'))).toBe(false);
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>(async () => {
      controller.abort();
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    await scanSubnet('10.0.0.5', { concurrency: 1, signal: controller.signal });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
