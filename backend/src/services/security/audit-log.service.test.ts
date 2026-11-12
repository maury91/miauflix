import type { Database } from '@database/database';
import { AuditEventType } from '@entities/audit-log.entity';
import type { ConfigService } from '@mytypes/configuration';

import { AuditLogService } from './audit-log.service';

function setup() {
  const repository = {
    insertMany: jest.fn(() => Promise.resolve()),
    deleteOldLogs: jest.fn(() => Promise.resolve(3)),
  };
  const db = { getAuditLogRepository: () => repository } as unknown as Database;
  const config = { get: () => undefined } as unknown as ConfigService;
  return { service: new AuditLogService(db, config), repository };
}

const event = { eventType: AuditEventType.API_ACCESS, description: 'GET /api/x' };

describe('AuditLogService', () => {
  afterEach(() => jest.useRealTimers());

  it('returns before the event is written, then writes the queue in one batch', async () => {
    jest.useFakeTimers();
    const { service, repository } = setup();

    await service.logSecurityEvent(event);
    await service.logSecurityEvent(event);
    expect(repository.insertMany).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1_000);
    expect(repository.insertMany).toHaveBeenCalledTimes(1);
    const [rows] = repository.insertMany.mock.calls[0] as unknown as [unknown[]];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(expect.objectContaining({ createdAt: expect.any(Date) }));
  });

  it('writes a full batch without waiting', async () => {
    jest.useFakeTimers();
    const { service, repository } = setup();
    for (let i = 0; i < 200; i++) await service.logSecurityEvent(event);
    await jest.advanceTimersByTimeAsync(0);
    expect(repository.insertMany).toHaveBeenCalledTimes(1);
  });

  it('retries a failed batch instead of dropping it', async () => {
    jest.useFakeTimers();
    const { service, repository } = setup();
    repository.insertMany.mockRejectedValueOnce(new Error('locked'));
    await service.logSecurityEvent(event);

    await jest.advanceTimersByTimeAsync(1_000); // first attempt fails
    await jest.advanceTimersByTimeAsync(5_000); // retry succeeds
    expect(repository.insertMany).toHaveBeenCalledTimes(2);
    const calls = repository.insertMany.mock.calls as unknown as [unknown[]][];
    expect(calls[1][0]).toHaveLength(1);
    await expect(service.close()).resolves.toBe(0);
  });

  it('gives up on a batch after three attempts', async () => {
    const { service, repository } = setup();
    repository.insertMany.mockRejectedValue(new Error('disk full'));
    await service.logSecurityEvent(event);
    // The dropped batch counts as never written.
    await expect(service.close()).resolves.toBe(1);
    expect(repository.insertMany).toHaveBeenCalledTimes(3);
  });

  it('waits for the retry timer instead of retrying on every flush call', async () => {
    jest.useFakeTimers();
    const { service, repository } = setup();
    repository.insertMany.mockRejectedValueOnce(new Error('locked'));
    await service.logSecurityEvent(event);
    await jest.advanceTimersByTimeAsync(1_000); // fails
    await Promise.all([service.flush(), service.flush(), service.flush()]);
    expect(repository.insertMany).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(5_000);
    expect(repository.insertMany).toHaveBeenCalledTimes(2);
    await expect(service.close()).resolves.toBe(0);
  });

  it('never sheds an event from the batch being written', async () => {
    const { service, repository } = setup();
    let release!: () => void;
    repository.insertMany.mockImplementationOnce(() => new Promise<void>(r => (release = r)));
    // The in-flight batch: 199 access records and one security event at its end.
    for (let i = 0; i < 199; i++) await service.logSecurityEvent(event);
    await service.logSecurityEvent({ eventType: AuditEventType.LOGOUT });
    for (let i = 0; i < 4_800; i++) await service.logSecurityEvent(event);
    await service.logSecurityEvent({ eventType: AuditEventType.LOGIN_FAILURE });
    release();
    await service.close();
    const calls = repository.insertMany.mock.calls as unknown as [{ eventType: string }[]][];
    expect(calls[0][0]).toHaveLength(200);
    const rows = calls.flatMap(([batch]) => batch);
    expect(rows.filter(row => row.eventType === AuditEventType.LOGOUT)).toHaveLength(1);
    expect(rows.filter(row => row.eventType === AuditEventType.LOGIN_FAILURE)).toHaveLength(1);
    expect(rows).toHaveLength(5_000);
  });

  it('writes what is queued on close and refuses events after it', async () => {
    const { service, repository } = setup();
    await service.logSecurityEvent(event);
    await service.close();
    await service.logSecurityEvent(event);
    await service.flush();
    expect(repository.insertMany).toHaveBeenCalledTimes(1);
  });

  it('sheds queued access records to keep security events when the queue is full', async () => {
    const { service, repository } = setup();
    let release!: () => void;
    repository.insertMany.mockImplementationOnce(() => new Promise<void>(r => (release = r)));
    for (let i = 0; i < 200 + 5_000; i++) await service.logSecurityEvent(event);
    await service.logSecurityEvent({ eventType: AuditEventType.LOGIN_FAILURE });
    release();
    // 5 201 events against a limit of 5 000: 200 access records dropped and 1 shed.
    await expect(service.close()).resolves.toBe(201);
    const rows = (
      repository.insertMany.mock.calls as unknown as [{ eventType: string }[]][]
    ).flatMap(([batch]) => batch);
    // The batch being written counts toward the limit until it is written.
    expect(rows).toHaveLength(5_000);
    expect(rows.filter(row => row.eventType === AuditEventType.LOGIN_FAILURE)).toHaveLength(1);
  });

  it('waits the full retry delay even if an event set a shorter timer during the write', async () => {
    jest.useFakeTimers();
    const { service, repository } = setup();
    let fail!: (error: Error) => void;
    repository.insertMany.mockImplementationOnce(
      () => new Promise<void>((_, reject) => (fail = reject))
    );
    await service.logSecurityEvent(event);
    await jest.advanceTimersByTimeAsync(1_000); // the write starts and hangs
    await service.logSecurityEvent(event); // sets the 1 s timer
    fail(new Error('locked'));
    await jest.advanceTimersByTimeAsync(4_000);
    expect(repository.insertMany).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(repository.insertMany).toHaveBeenCalledTimes(2);
    await expect(service.close()).resolves.toBe(0);
  });

  it('does not return from close() while a replacement write is still running', async () => {
    jest.useFakeTimers();
    const { service, repository } = setup();
    let failFirst!: (error: Error) => void;
    let finishSecond!: () => void;
    repository.insertMany
      .mockImplementationOnce(() => new Promise<void>((_, reject) => (failFirst = reject)))
      .mockImplementationOnce(() => new Promise<void>(resolve => (finishSecond = resolve)));

    for (let i = 0; i < 5; i++) await service.logSecurityEvent(event);
    await jest.advanceTimersByTimeAsync(1_000); // first write starts and hangs
    await service.logSecurityEvent(event);
    await jest.advanceTimersByTimeAsync(1_000); // its timer asks for another pass

    let closed = false;
    const closing = service.close().then(() => (closed = true));
    failFirst(new Error('locked')); // during close: the batch goes back and is retried
    await jest.advanceTimersByTimeAsync(0);
    expect(repository.insertMany).toHaveBeenCalledTimes(2);
    expect(closed).toBe(false); // the retry is still writing

    finishSecond();
    await closing;
    const calls = repository.insertMany.mock.calls as unknown as [unknown[]][];
    expect(calls[1][0]).toHaveLength(6);
  });

  it('applies the shorter retention to API access records only', async () => {
    const { service, repository } = setup();
    await expect(service.cleanupOldLogs({ apiAccessDays: 14, otherDays: 90 })).resolves.toBe(6);
    expect(repository.deleteOldLogs).toHaveBeenCalledWith(expect.any(Date), {
      eventTypes: [AuditEventType.API_ACCESS],
    });
    expect(repository.deleteOldLogs).toHaveBeenCalledWith(expect.any(Date), {
      excludeEventTypes: [AuditEventType.API_ACCESS],
    });
  });
});
