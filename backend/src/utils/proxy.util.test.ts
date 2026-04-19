import type { Context } from 'hono';

// Extend Context type to include connInfo for our tests
declare module 'hono' {
  interface Context {
    connInfo?: {
      remote: {
        address: string;
      };
    };
  }
}

// Mock the getConnInfo function
jest.mock('@hono/node-server/conninfo', () => ({
  getConnInfo: jest.fn((context: Context) => {
    // Use the context's own connInfo property that we've set up in our mocks
    return context.connInfo;
  }),
}));

import { getRealClientIp } from './proxy.util';

const createMockContext = (ip: string, headers: Record<string, string> = {}): Context => {
  return {
    req: {
      raw: {
        headers: new Headers(headers),
      },
      header: (name: string) => headers[name.toLowerCase()] || null,
    },
    get: (name: string) => headers[name.toLowerCase()],
    // Mock the connInfo that would be extracted by getConnInfo
    connInfo: {
      remote: {
        address: ip,
      },
    },
  } as unknown as Context;
};

describe('getRealClientIp', () => {
  const setupTest = () => {
    const proxySecret = 'test-secret';
    const buildMockContext = (ip: string, headers: Record<string, string> = {}) =>
      createMockContext(ip, headers);
    return { proxySecret, buildMockContext };
  };

  it('should return direct IP when no secret is configured', () => {
    const { buildMockContext } = setupTest();
    const mockContext = buildMockContext('192.168.1.1', {
      'x-forwarded-for': '10.0.0.1',
    });

    expect(getRealClientIp(mockContext, undefined)).toBe('192.168.1.1');
  });

  it('should return direct IP when no proxy headers are present', () => {
    const { proxySecret, buildMockContext } = setupTest();
    const mockContext = buildMockContext('192.168.1.1');
    expect(getRealClientIp(mockContext, proxySecret)).toBe('192.168.1.1');
  });

  it('should return direct IP when proxy secret is not provided', () => {
    const { proxySecret, buildMockContext } = setupTest();
    const mockContext = buildMockContext('192.168.1.1', {
      'x-forwarded-for': '10.0.0.1',
    });

    expect(getRealClientIp(mockContext, proxySecret)).toBe('192.168.1.1');
  });

  it('should return direct IP when proxy secret is wrong', () => {
    const { proxySecret, buildMockContext } = setupTest();
    const mockContext = buildMockContext('192.168.1.1', {
      'x-reverse-proxy-secret': 'wrong-secret',
      'x-forwarded-for': '10.0.0.1',
    });

    expect(getRealClientIp(mockContext, proxySecret)).toBe('192.168.1.1');
  });

  it('should return client IP when proxy secret is correct', () => {
    const { proxySecret, buildMockContext } = setupTest();
    const mockContext = buildMockContext('192.168.1.1', {
      'x-reverse-proxy-secret': proxySecret,
      'x-forwarded-for': '10.0.0.1',
    });

    expect(getRealClientIp(mockContext, proxySecret)).toBe('10.0.0.1');
  });

  it('should return first IP from X-Forwarded-For when there are multiple', () => {
    const { proxySecret, buildMockContext } = setupTest();
    const mockContext = buildMockContext('192.168.1.1', {
      'x-reverse-proxy-secret': proxySecret,
      'x-forwarded-for': '10.0.0.1, 11.11.11.11, 22.22.22.22',
    });

    expect(getRealClientIp(mockContext, proxySecret)).toBe('10.0.0.1');
  });

  it('should handle spaces in X-Forwarded-For', () => {
    const { proxySecret, buildMockContext } = setupTest();
    const mockContext = buildMockContext('192.168.1.1', {
      'x-reverse-proxy-secret': proxySecret,
      'x-forwarded-for': ' 10.0.0.1 , 11.11.11.11 ',
    });

    expect(getRealClientIp(mockContext, proxySecret)).toBe('10.0.0.1');
  });

  it('should return undefined when context is undefined', () => {
    expect(getRealClientIp(undefined, undefined)).toBeUndefined();
  });

  it('should return direct IP when X-Forwarded-For header is empty', () => {
    const { proxySecret, buildMockContext } = setupTest();
    const mockContext = buildMockContext('192.168.1.1', {
      'x-reverse-proxy-secret': proxySecret,
      'x-forwarded-for': '',
    });

    expect(getRealClientIp(mockContext, proxySecret)).toBe('192.168.1.1');
  });
});
