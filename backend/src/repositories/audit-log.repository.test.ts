jest.mock('@logger');
jest.unmock('@database/database');

import { createTestDatabase } from '@__test-utils__/database.helpers';
import { logger } from '@logger';

import type { Database } from '@database/database';
import { AuditEventType } from '@entities/audit-log.entity';
import type { ConfigService } from '@mytypes/configuration';
import type { AuditLogRepository } from '@repositories/audit-log.repository';
import { AuditLogService } from '@services/security/audit-log.service';

describe('AuditLogRepository retention', () => {
  let helper: ReturnType<typeof createTestDatabase>;
  let database: Database;
  let repository: AuditLogRepository;

  beforeEach(async () => {
    helper = createTestDatabase();
    database = await helper.setupTestDatabase();
    repository = database.getAuditLogRepository();
  });

  afterEach(() => helper.cleanup());

  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  it('deletes old rows of the chosen event types in batches, keeping the rest', async () => {
    await repository.insertMany([
      ...Array.from({ length: 5 }, () => ({
        eventType: AuditEventType.API_ACCESS,
        createdAt: daysAgo(20),
      })),
      { eventType: AuditEventType.API_ACCESS, createdAt: daysAgo(1) },
      { eventType: AuditEventType.LOGIN_FAILURE, createdAt: daysAgo(20) },
      { eventType: AuditEventType.LOGIN_FAILURE, createdAt: daysAgo(100) },
    ]);

    await expect(
      repository.deleteOldLogs(daysAgo(14), { eventTypes: [AuditEventType.API_ACCESS] }, 2)
    ).resolves.toBe(5);
    await expect(
      repository.deleteOldLogs(daysAgo(90), { excludeEventTypes: [AuditEventType.API_ACCESS] })
    ).resolves.toBe(1);

    const left = await repository.findRecent();
    expect(left.map(row => row.eventType).sort()).toEqual([
      AuditEventType.API_ACCESS,
      AuditEventType.LOGIN_FAILURE,
    ]);
  });

  it('applies both event type filters when both are given', async () => {
    await repository.insertMany([
      { eventType: AuditEventType.API_ACCESS, createdAt: daysAgo(20) },
      { eventType: AuditEventType.LOGIN, createdAt: daysAgo(20) },
      { eventType: AuditEventType.LOGOUT, createdAt: daysAgo(20) },
    ]);
    await expect(
      repository.deleteOldLogs(daysAgo(14), {
        eventTypes: [AuditEventType.API_ACCESS, AuditEventType.LOGIN],
        excludeEventTypes: [AuditEventType.API_ACCESS],
      })
    ).resolves.toBe(1);
    const left = await repository.findRecent();
    expect(left.map(row => row.eventType).sort()).toEqual([
      AuditEventType.API_ACCESS,
      AuditEventType.LOGOUT,
    ]);
  });

  const config = { get: () => undefined } as unknown as ConfigService;

  it('writes audit events after an open transaction, and keeps them when it rolls back', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const transaction = database
      .transaction(async manager => {
        await manager.query('SELECT 1');
        await gate;
        throw new Error('rolled back');
      })
      .catch(() => undefined);

    const service = new AuditLogService(database, config);
    await service.logSecurityEvent({ eventType: AuditEventType.LOGIN_FAILURE });
    let flushed = false;
    const flush = service.flush().then(() => (flushed = true));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(flushed).toBe(false); // queued behind the transaction in the write lane

    release();
    await transaction;
    await flush;
    expect((await repository.findRecent()).map(row => row.eventType)).toEqual([
      AuditEventType.LOGIN_FAILURE,
    ]);
  });

  it('stores a valid event written in the same batch as one with unserializable metadata', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const service = new AuditLogService(database, config);
    await service.logSecurityEvent({
      eventType: AuditEventType.API_ERROR,
      metadata: { path: '/api/x', circular, big: BigInt(1) },
    });
    await service.logSecurityEvent({ eventType: AuditEventType.LOGIN_FAILURE });
    await expect(service.close()).resolves.toBe(0);

    const rows = await repository.findRecent();
    expect(rows.map(row => row.eventType).sort()).toEqual([
      AuditEventType.API_ERROR,
      AuditEventType.LOGIN_FAILURE,
    ]);
    const error = rows.find(row => row.eventType === AuditEventType.API_ERROR)!;
    expect(error.metadata).toEqual(
      expect.objectContaining({ unserializable: expect.any(String), path: '/api/x' })
    );
  });

  it('logs a failed query, or a failed audit write, without its parameter values', async () => {
    const secret = 'victim@example.com';
    const logged = () =>
      JSON.stringify([
        (logger.error as jest.Mock).mock.calls,
        (logger.warn as jest.Mock).mock.calls,
      ]);

    await expect(
      repository['repository'].query('INSERT INTO missing_table VALUES (?)', [secret])
    ).rejects.toThrow();
    expect(logged()).toContain('missing_table');
    expect(logged()).not.toContain(secret);

    const service = new AuditLogService(database, config);
    jest
      .spyOn(repository, 'insertMany')
      .mockImplementation(() =>
        repository['repository'].query('INSERT INTO missing_table VALUES (?)', [secret])
      );
    await service.logSecurityEvent({ eventType: AuditEventType.LOGIN_FAILURE, userEmail: secret });
    await service.close();
    expect(logged()).toContain('Unable to write 1 audit events');
    expect(logged()).not.toContain(secret);
  });

  it('uses WAL and indexes createdAt', async () => {
    const raw = database.getRepository((await import('@entities/audit-log.entity')).AuditLog);
    await expect(raw.query('PRAGMA journal_mode')).resolves.toEqual([{ journal_mode: 'wal' }]);
    const indexes = (await raw.query("PRAGMA index_list('audit_logs')")) as { name: string }[];
    expect(indexes.map(index => index.name)).toEqual(
      expect.arrayContaining(['IDX_audit_logs_createdAt', 'IDX_audit_logs_eventType_createdAt'])
    );
  });
});
