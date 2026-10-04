import type { Context } from 'hono';

import type { Database } from '@database/database';
import { AuditEventSeverity, AuditEventType } from '@entities/audit-log.entity';
import type { AuditLogRepository } from '@repositories/audit-log.repository';

import { AuditLogService } from './audit-log.service';

// Mock getRealClientIp to simplify testing
jest.mock('@utils/proxy.util', () => ({
  getRealClientIp: jest.fn(() => '1.2.3.4'),
}));

const createMockContext = (
  headers: Record<string, string> = {},
  method = 'POST',
  url = 'http://example.com/test?foo=bar'
): Context => {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    req: {
      method,
      url,
      raw: { headers: new Headers(headers) },
      header: (name: string) => lower[name.toLowerCase()],
    },
  } as unknown as Context;
};

describe('AuditLogService', () => {
  const setupTest = () => {
    const mockRepo = {
      create: jest.fn(),
      findRecent: jest.fn(),
      findByUserId: jest.fn(),
      findByEventType: jest.fn(),
      findBySeverity: jest.fn(),
      deleteOldLogs: jest.fn(),
    } as unknown as jest.Mocked<AuditLogRepository>;

    const mockDb = {
      getAuditLogRepository: () => mockRepo,
    } as unknown as Database;

    return { service: new AuditLogService(mockDb), mockRepo };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('redacts sensitive headers and saves correct payload', async () => {
    const { service, mockRepo } = setupTest();
    const context = createMockContext({
      Authorization: 'secret',
      Cookie: 'session=abc',
      'X-Reverse-Proxy-Secret': 'proxy',
      'User-Agent': 'TestAgent',
      'X-Custom': 'value',
    });

    await service.logSecurityEvent({
      eventType: AuditEventType.LOGIN,
      severity: AuditEventSeverity.INFO,
      description: 'Test',
      userEmail: 'user@example.com',
      context,
      metadata: { extra: true },
    });

    expect(mockRepo.create).toHaveBeenCalledTimes(1);
    const payload = mockRepo.create.mock.calls[0][0];

    expect(payload).toEqual({
      eventType: AuditEventType.LOGIN,
      severity: AuditEventSeverity.INFO,
      description: 'Test',
      userEmail: 'user@example.com',
      metadata: {
        method: 'POST',
        query: { foo: 'bar' },
        headers: {
          authorization: 'REDACTED',
          cookie: 'REDACTED',
          'x-reverse-proxy-secret': 'REDACTED',
          'user-agent': 'TestAgent',
          'x-custom': 'value',
        },
        extra: true,
      },
      ipAddress: '1.2.3.4',
      userAgent: 'TestAgent',
    });
  });

  describe('convenience methods', () => {
    it('logLoginAttempt success', async () => {
      const { service } = setupTest();
      const ctx = createMockContext();
      const spy = jest.spyOn(service, 'logSecurityEvent').mockResolvedValue();
      await service.logLoginAttempt({ success: true, userEmail: 'a@b.c', context: ctx });
      expect(spy).toHaveBeenCalledWith({
        eventType: AuditEventType.LOGIN,
        severity: AuditEventSeverity.INFO,
        description: 'Successful login',
        userEmail: 'a@b.c',
        context: ctx,
      });
    });

    it('logLoginAttempt failure', async () => {
      const { service } = setupTest();
      const ctx = createMockContext();
      const spy = jest.spyOn(service, 'logSecurityEvent').mockResolvedValue();
      await service.logLoginAttempt({ success: false, userEmail: 'a@b.c', context: ctx });
      expect(spy).toHaveBeenCalledWith({
        eventType: AuditEventType.LOGIN_FAILURE,
        severity: AuditEventSeverity.WARNING,
        description: 'Failed login attempt',
        userEmail: 'a@b.c',
        context: ctx,
      });
    });

    it('logLogout', async () => {
      const { service } = setupTest();
      const ctx = createMockContext();
      const spy = jest.spyOn(service, 'logSecurityEvent').mockResolvedValue();
      await service.logLogout({ userEmail: 'u', context: ctx });
      expect(spy).toHaveBeenCalledWith({
        eventType: AuditEventType.LOGOUT,
        severity: AuditEventSeverity.INFO,
        description: 'User logged out',
        userEmail: 'u',
        context: ctx,
      });
    });

    it('logTokenRefresh', async () => {
      const { service } = setupTest();
      const ctx = createMockContext();
      const spy = jest.spyOn(service, 'logSecurityEvent').mockResolvedValue();
      await service.logTokenRefresh({ userEmail: 'u', context: ctx });
      expect(spy).toHaveBeenCalledWith({
        eventType: AuditEventType.TOKEN_REFRESH,
        severity: AuditEventSeverity.INFO,
        description: 'Access token refreshed',
        userEmail: 'u',
        context: ctx,
      });
    });

    it('logTokenInvalidation', async () => {
      const { service } = setupTest();
      const ctx = createMockContext();
      const spy = jest.spyOn(service, 'logSecurityEvent').mockResolvedValue();
      await service.logTokenInvalidation({ userEmail: 'u', context: ctx, reason: 'expired' });
      expect(spy).toHaveBeenCalledWith({
        eventType: AuditEventType.TOKEN_INVALIDATION,
        severity: AuditEventSeverity.WARNING,
        description: 'Token invalidated: expired',
        userEmail: 'u',
        context: ctx,
      });
    });

    it('logSuspiciousActivity', async () => {
      const { service } = setupTest();
      const ctx = createMockContext();
      const spy = jest.spyOn(service, 'logSecurityEvent').mockResolvedValue();
      await service.logSuspiciousActivity({ context: ctx, description: 'suspicious' });
      expect(spy).toHaveBeenCalledWith({
        eventType: AuditEventType.SUSPICIOUS_ACTIVITY,
        severity: AuditEventSeverity.WARNING,
        context: ctx,
        description: 'suspicious',
      });
    });

    it('logRateLimitExceeded', async () => {
      const { service } = setupTest();
      const ctx = createMockContext();
      const spy = jest.spyOn(service, 'logSecurityEvent').mockResolvedValue();
      await service.logRateLimitExceeded({ context: ctx, limit: 5 });
      expect(spy).toHaveBeenCalledWith({
        eventType: AuditEventType.RATE_LIMIT_EXCEEDED,
        severity: AuditEventSeverity.WARNING,
        description: 'Rate limit of 5 exceeded',
        context: ctx,
      });
    });

    it('logUnauthorizedAccess', async () => {
      const { service } = setupTest();
      const ctx = createMockContext();
      const spy = jest.spyOn(service, 'logSecurityEvent').mockResolvedValue();
      await service.logUnauthorizedAccess({ context: ctx, reason: 'bad' });
      expect(spy).toHaveBeenCalledWith({
        eventType: AuditEventType.UNAUTHORIZED_ACCESS,
        severity: AuditEventSeverity.WARNING,
        description: 'bad',
        context: ctx,
      });
    });
  });
});
