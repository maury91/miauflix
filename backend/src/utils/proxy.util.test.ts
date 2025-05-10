// filepath: /home/vscode/projects/miauflix-bun/backend/src/utils/proxy.util.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Context } from 'elysia';
import type { Server } from 'elysia/dist/universal/server';

import { getRealClientIp } from './proxy.util';

const originalEnv = { ...process.env };

const createMockServer = (ip: string) => {
  return {
    requestIP: () => ({
      address: ip,
      family: 'IPv4',
      port: 12345,
    }),
  } satisfies Pick<Server, 'requestIP'> as unknown as Context['server'];
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

    const mockRequest = new Request('http://example.com', {
      headers: {
        'x-reverse-proxy-secret': proxySecret,
        'x-forwarded-for': '10.0.0.1',
      },
    });

    const mockServer = createMockServer('192.168.1.1');
    expect(getRealClientIp(mockRequest, mockServer)).toBe('192.168.1.1');
  });

  it('should return direct IP when proxy secret is missing', () => {
    const mockRequest = new Request('http://example.com', {
      headers: {
        'x-forwarded-for': '10.0.0.1',
      },
    });

    const mockServer = createMockServer('192.168.1.1');
    expect(getRealClientIp(mockRequest, mockServer)).toBe('192.168.1.1');
  });

  it('should return direct IP when proxy secret is incorrect', () => {
    const mockRequest = new Request('http://example.com', {
      headers: {
        'x-reverse-proxy-secret': 'wrong-secret',
        'x-forwarded-for': '10.0.0.1',
      },
    });

    const mockServer = createMockServer('192.168.1.1');
    expect(getRealClientIp(mockRequest, mockServer)).toBe('192.168.1.1');
  });

  it('should return client IP when proxy secret is correct', () => {
    const mockRequest = new Request('http://example.com', {
      headers: {
        'x-reverse-proxy-secret': proxySecret,
        'x-forwarded-for': '10.0.0.1',
      },
    });

    const mockServer = createMockServer('192.168.1.1');
    expect(getRealClientIp(mockRequest, mockServer)).toBe('10.0.0.1');
  });

  it('should return first IP from X-Forwarded-For when there are multiple', () => {
    const mockRequest = new Request('http://example.com', {
      headers: {
        'x-reverse-proxy-secret': proxySecret,
        'x-forwarded-for': '10.0.0.1, 11.11.11.11, 22.22.22.22',
      },
    });

    const mockServer = createMockServer('192.168.1.1');
    expect(getRealClientIp(mockRequest, mockServer)).toBe('10.0.0.1');
  });

  it('should handle spaces in X-Forwarded-For', () => {
    const mockRequest = new Request('http://example.com', {
      headers: {
        'x-reverse-proxy-secret': proxySecret,
        'x-forwarded-for': ' 10.0.0.1 , 11.11.11.11 ',
      },
    });

    const mockServer = createMockServer('192.168.1.1');
    expect(getRealClientIp(mockRequest, mockServer)).toBe('10.0.0.1');
  });

  it('should return undefined when request is undefined', () => {
    const mockServer = createMockServer('192.168.1.1');
    expect(getRealClientIp(undefined, mockServer)).toBeUndefined();
  });

  it('should return undefined when server is undefined and secret is missing', () => {
    const mockRequest = new Request('http://example.com', {
      headers: {
        'x-forwarded-for': '10.0.0.1',
      },
    });

    expect(getRealClientIp(mockRequest, undefined)).toBeUndefined();
  });

  it('should return client IP when server is undefined and secret is correct', () => {
    const mockRequest = new Request('http://example.com', {
      headers: {
        'x-forwarded-for': '10.0.0.1',
        'x-reverse-proxy-secret': proxySecret,
      },
    });

    expect(getRealClientIp(mockRequest, undefined)).toBe('10.0.0.1');
  });
});
