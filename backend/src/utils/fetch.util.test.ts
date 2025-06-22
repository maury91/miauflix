import { enhancedFetch } from './fetch.util';

// Mock global fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('Enhanced Fetch Utility', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('enhancedFetch', () => {
    it('should make basic HTTP requests', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
        text: () => Promise.resolve('{"success":true}'),
        headers: new Headers(),
        statusText: 'OK',
      } as Response;

      mockFetch.mockResolvedValue(mockResponse);

      const result = await enhancedFetch('http://example.com');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
    });

    it('should handle query string parameters', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers(),
        statusText: 'OK',
      } as Response;

      mockFetch.mockResolvedValue(mockResponse);

      await enhancedFetch('http://example.com', {
        queryString: {
          param1: 'value1',
          param2: 123,
          param3: true,
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://example.com?param1=value1&param2=123&param3=true',
        expect.objectContaining({
          headers: expect.objectContaining({
            'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8,it;q=0.7,pl;q=0.6,lt;q=0.5',
            priority: 'u=0, i',
            referer: 'http://example.com/',
            'user-agent': expect.stringContaining('Mozilla/5.0'),
          }),
        })
      );
    });

    it('should handle timeout by setting up AbortController', async () => {
      // This test verifies timeout setup without actually testing timeout behavior
      // which is difficult to test reliably with mocks
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers(),
        statusText: 'OK',
      } as Response;

      let capturedSignal: AbortSignal | undefined;
      mockFetch.mockImplementation((url, options) => {
        capturedSignal = options?.signal as AbortSignal;
        return Promise.resolve(mockResponse);
      });

      await enhancedFetch('http://example.com', { timeout: 1000 });

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal).toBeInstanceOf(AbortSignal);
    });

    it('should pass through fetch options', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers(),
        statusText: 'OK',
      } as Response;

      mockFetch.mockResolvedValue(mockResponse);

      const customHeaders = { 'Content-Type': 'application/json' };

      await enhancedFetch('http://example.com', {
        method: 'POST',
        headers: customHeaders,
        body: JSON.stringify({ test: 'data' }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://example.com',
        expect.objectContaining({
          method: 'POST',
          body: '{"test":"data"}',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8,it;q=0.7,pl;q=0.6,lt;q=0.5',
            priority: 'u=0, i',
            referer: 'http://example.com/',
            'user-agent': expect.stringContaining('Mozilla/5.0'),
          }),
        })
      );
    });

    it('should handle HTTP errors', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
        json: () => Promise.resolve({ error: 'Not found' }),
        text: () => Promise.resolve('{"error":"Not found"}'),
      } as Response;

      mockFetch.mockResolvedValue(mockResponse);

      const result = await enhancedFetch('http://example.com/notfound');

      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(enhancedFetch('http://example.com')).rejects.toThrow('Network error');
    });

    it('should add default headers', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers(),
        statusText: 'OK',
      } as Response;

      mockFetch.mockResolvedValue(mockResponse);

      await enhancedFetch('http://example.com');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://example.com',
        expect.objectContaining({
          headers: expect.objectContaining({
            'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8,it;q=0.7,pl;q=0.6,lt;q=0.5',
            priority: 'u=0, i',
            referer: 'http://example.com/',
            'user-agent': expect.stringContaining('Mozilla/5.0'),
          }),
        })
      );
    });

    it('should override default headers with custom ones', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers(),
        statusText: 'OK',
      } as Response;

      mockFetch.mockResolvedValue(mockResponse);

      await enhancedFetch('http://example.com', {
        headers: {
          'user-agent': 'Custom User Agent',
          'accept-language': 'fr-FR',
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://example.com',
        expect.objectContaining({
          headers: expect.objectContaining({
            'accept-language': 'fr-FR',
            'user-agent': 'Custom User Agent',
            priority: 'u=0, i',
            referer: 'http://example.com/',
          }),
        })
      );
    });

    it('should handle URL objects', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers(),
        statusText: 'OK',
      } as Response;

      mockFetch.mockResolvedValue(mockResponse);

      const url = new URL('http://example.com/api');
      await enhancedFetch(url);

      expect(mockFetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          headers: expect.objectContaining({
            referer: 'http://example.com/',
          }),
        })
      );
    });

    it('should handle complex query strings', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers(),
        statusText: 'OK',
      } as Response;

      mockFetch.mockResolvedValue(mockResponse);

      await enhancedFetch('http://example.com', {
        queryString: {
          search: 'hello world',
          page: 0,
          active: false,
          limit: 50,
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://example.com?search=hello+world&page=0&active=false&limit=50',
        expect.any(Object)
      );
    });

    it('should clear timeout on successful request', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers(),
        statusText: 'OK',
      } as Response;

      mockFetch.mockResolvedValue(mockResponse);
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      await enhancedFetch('http://example.com', { timeout: 5000 });

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('should clear timeout on failed request', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      try {
        await enhancedFetch('http://example.com', { timeout: 5000 });
      } catch (error) {
        // Expected to fail
        expect(error).toBeDefined();
      }

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });
});
