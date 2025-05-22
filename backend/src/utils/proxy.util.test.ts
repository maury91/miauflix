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

// Mock the ENV import
jest.mock('@constants', () => ({
  ENV: jest.fn((key: string) => {
    if (key === 'REVERSE_PROXY_SECRET') {
      return process.env.REVERSE_PROXY_SECRET || '';
    }
    return '';
  }),
}));

// Mock the getConnInfo function
jest.mock('@hono/node-server/conninfo', () => ({
  getConnInfo: jest.fn((context: Context) => {
    // Use the context's own connInfo property that we've set up in our mocks
    return context.connInfo;
  }),
}));

import { getRealClientIp } from './proxy.util';

const originalEnv = { ...process.env };

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
  const proxySecret = 'test-secret';

  beforeEach(() => {
    process.env = { ...originalEnv, REVERSE_PROXY_SECRET: proxySecret };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return direct IP when no secret is configured', () => {
    // Empty secret
    process.env.REVERSE_PROXY_SECRET = '';

    const mockContext = createMockContext('192.168.1.1', {
      'x-forwarded-for': '10.0.0.1',
    });

    expect(getRealClientIp(mockContext)).toBe('192.168.1.1');
  });

  it('should return direct IP when no proxy headers are present', () => {
    const mockContext = createMockContext('192.168.1.1');
    expect(getRealClientIp(mockContext)).toBe('192.168.1.1');
  });

  it('should return direct IP when proxy secret is not provided', () => {
    const mockContext = createMockContext('192.168.1.1', {
      'x-forwarded-for': '10.0.0.1',
    });

    expect(getRealClientIp(mockContext)).toBe('192.168.1.1');
  });

  it('should return direct IP when proxy secret is wrong', () => {
    const mockContext = createMockContext('192.168.1.1', {
      'x-reverse-proxy-secret': 'wrong-secret',
      'x-forwarded-for': '10.0.0.1',
    });

    expect(getRealClientIp(mockContext)).toBe('192.168.1.1');
  });

  it('should return client IP when proxy secret is correct', () => {
    const mockContext = createMockContext('192.168.1.1', {
      'x-reverse-proxy-secret': proxySecret,
      'x-forwarded-for': '10.0.0.1',
    });

    expect(getRealClientIp(mockContext)).toBe('10.0.0.1');
  });

  it('should return first IP from X-Forwarded-For when there are multiple', () => {
    const mockContext = createMockContext('192.168.1.1', {
      'x-reverse-proxy-secret': proxySecret,
      'x-forwarded-for': '10.0.0.1, 11.11.11.11, 22.22.22.22',
    });

    expect(getRealClientIp(mockContext)).toBe('10.0.0.1');
  });

  it('should handle spaces in X-Forwarded-For', () => {
    const mockContext = createMockContext('192.168.1.1', {
      'x-reverse-proxy-secret': proxySecret,
      'x-forwarded-for': ' 10.0.0.1 , 11.11.11.11 ',
    });

    expect(getRealClientIp(mockContext)).toBe('10.0.0.1');
  });

  it('should return undefined when context is undefined', () => {
    expect(getRealClientIp(undefined)).toBeUndefined();
  });

  it('should return direct IP when X-Forwarded-For header is empty', () => {
    const mockContext = createMockContext('192.168.1.1', {
      'x-reverse-proxy-secret': proxySecret,
      'x-forwarded-for': '',
    });

    expect(getRealClientIp(mockContext)).toBe('192.168.1.1');
  });
});
