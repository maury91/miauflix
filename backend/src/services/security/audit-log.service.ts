import { logger } from '@logger';
import type { Context } from 'hono';

import type { Database } from '@database/database';
import { describeDatabaseError } from '@database/safe-error';
import type { AuditLog } from '@entities/audit-log.entity';
import { AuditEventSeverity, AuditEventType } from '@entities/audit-log.entity';
import type { ConfigService } from '@mytypes/configuration';
import type { AuditLogRepository } from '@repositories/audit-log.repository';
import { getRealClientIp } from '@utils/proxy.util';
import { redactHeaders, redactPath, redactQuery } from '@utils/redact.util';

/** How long an event may wait in memory before it is written. */
const FLUSH_DELAY_MS = 1_000;
/** A full batch is written at once instead of waiting for the delay. */
const FLUSH_BATCH_SIZE = 200;
/** Above this many unwritten events (the database is stuck or a flood outpaces it) new ones are dropped. */
const MAX_PENDING = 5_000;
/** A batch that fails to write is tried this many times in all, this long apart. */
const MAX_WRITE_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5_000;

/** Retention: plain access records are bulky and short-lived; security events are kept longer. */
export const AUDIT_RETENTION_DAYS = { apiAccess: 14, other: 90 } as const;

/**
 * A plain JSON copy of `value`, so one event that cannot be stored (a circular reference, a
 * BigInt) does not fail the batch it is written with, and later changes to the caller's
 * objects do not change the queued event.
 */
function jsonSafe(value: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch (error) {
    return {
      unserializable: error instanceof Error ? error.message : String(error),
      ...(typeof value.path === 'string' && { path: value.path }),
      ...(typeof value.method === 'string' && { method: value.method }),
    };
  }
}

export class AuditLogService {
  private repository: AuditLogRepository;
  private pending: Partial<AuditLog>[] = [];
  /** The batch being written; never shed, and back at the front of `pending` if it fails. */
  private inFlight: Partial<AuditLog>[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private flushAgain = false;
  private waitingForRetry = false;
  private dropped = 0;
  private lost = 0;
  /** Every event dropped for a full or closed queue; `dropped` is reset once reported. */
  private discarded = 0;
  private failedAttempts = 0;
  private closed = false;

  constructor(
    db: Database,
    private readonly config: ConfigService
  ) {
    this.repository = db.getAuditLogRepository();
  }

  /**
   * Record a security event. The row is queued and written in a batch shortly after, so a
   * request never waits on the database (or on another operation's transaction) to be audited.
   */
  async logSecurityEvent(params: {
    eventType: AuditEventType;
    severity?: AuditEventSeverity;
    description?: string;
    context?: Context;
    userEmail?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const { eventType, severity, description, context, userEmail, metadata } = params;
      const ipAddress =
        getRealClientIp(context, this.config.get('REVERSE_PROXY_SECRET') ?? '') || 'unknown';
      const userAgent = context?.req.header('user-agent') || undefined;

      const logData = {
        eventType,
        severity,
        description,
        userEmail,
        metadata: jsonSafe({
          ...(context && {
            method: context.req.method,
            query: redactQuery(new URL(context.req.url).searchParams),
            headers: redactHeaders(context.req.raw.headers),
          }),
          ...metadata,
          ...(typeof metadata?.path === 'string' && { path: redactPath(metadata.path) }),
        }),
        ipAddress,
        userAgent,
        // The event time, not the time the batch is written.
        createdAt: new Date(),
      };

      this.enqueue(logData);
    } catch (error) {
      logger.error('AuditLogService', 'Error logging security event', { error });
    }
  }

  private enqueue(entry: Partial<AuditLog>): void {
    if (this.closed) {
      // A request that outlived the shutdown drain; the database is about to close.
      this.noteDropped();
      return;
    }
    if (this.pending.length + this.inFlight.length >= MAX_PENDING) {
      // Make room for a security event by shedding a queued access record. Only `pending` is
      // searched: the batch being written is never touched.
      const shed =
        entry.eventType === AuditEventType.API_ACCESS
          ? -1
          : this.pending.findIndex(queued => queued.eventType === AuditEventType.API_ACCESS);
      this.noteDropped();
      if (shed === -1) return;
      this.pending.splice(shed, 1);
    }
    this.pending.push(entry);
    if (this.pending.length >= FLUSH_BATCH_SIZE) {
      void this.flush();
    } else {
      this.scheduleFlush(FLUSH_DELAY_MS);
    }
  }

  /** Counts a dropped event; the first drop of a run is reported at once. */
  private noteDropped(): void {
    this.discarded++;
    if (this.dropped++ === 0) {
      logger.warn('AuditLogService', 'Audit queue is full or closed; dropping audit events');
    }
  }

  private scheduleFlush(delayMs: number): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.waitingForRetry = false;
      void this.flush();
    }, delayMs);
    this.flushTimer.unref?.();
  }

  /**
   * Write every queued event. Calls while a write runs join it (and ask for another pass);
   * after a failed write nothing is tried until the retry timer fires, so a burst of calls
   * cannot use up a batch's attempts at once.
   */
  flush(): Promise<void> {
    if (this.waitingForRetry && !this.closed) return this.running ?? Promise.resolve();
    if (this.running) {
      this.flushAgain = true;
      return this.running;
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.running = this.drain().finally(() => {
      this.running = null;
      // While closing, close() drives every write itself, so none starts behind its back.
      if (this.flushAgain && !this.waitingForRetry && !this.closed && this.pending.length > 0) {
        this.flushAgain = false;
        void this.flush();
      }
      this.flushAgain = false;
    });
    return this.running;
  }

  /**
   * Writes batches until the queue is empty or a write fails. A failed batch goes back to the
   * front of the queue and is retried after RETRY_DELAY_MS, up to MAX_WRITE_ATTEMPTS in all;
   * then it is dropped and counted as lost.
   */
  private async drain(): Promise<void> {
    while (this.pending.length > 0) {
      this.inFlight = this.pending.splice(0, FLUSH_BATCH_SIZE);
      try {
        await this.repository.insertMany(this.inFlight);
        this.failedAttempts = 0;
      } catch (error) {
        this.failedAttempts++;
        if (this.failedAttempts >= MAX_WRITE_ATTEMPTS) {
          this.failedAttempts = 0;
          this.lost += this.inFlight.length;
          logger.error(
            'AuditLogService',
            `Unable to write ${this.inFlight.length} audit events after ${MAX_WRITE_ATTEMPTS} attempts; dropped them`,
            describeDatabaseError(error)
          );
          continue;
        }
        logger.warn(
          'AuditLogService',
          `Unable to write ${this.inFlight.length} audit events; retrying`,
          describeDatabaseError(error)
        );
        this.pending.unshift(...this.inFlight);
        if (!this.closed) {
          this.waitingForRetry = true;
          // Replace a shorter timer an event set meanwhile, so the retry really waits.
          if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
          }
          this.scheduleFlush(RETRY_DELAY_MS);
        }
        return;
      } finally {
        this.inFlight = [];
      }
    }
    if (this.dropped > 0) {
      logger.warn('AuditLogService', `Dropped ${this.dropped} audit events`);
      this.dropped = 0;
    }
  }

  /**
   * Stop accepting events and write what is queued (retrying a failed batch at once). Call
   * after the producers have stopped and before the database closes. Returns how many events
   * were never written: events dropped because the queue was full or closed, batches dropped
   * after failed writes, and what is still queued.
   */
  async close(): Promise<number> {
    this.closed = true;
    this.waitingForRetry = false;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.running;
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS && this.pending.length > 0; attempt++) {
      await this.flush();
    }
    // No write is running past this point: the database can close.
    await this.running;
    const unwritten = this.discarded + this.lost + this.pending.length;
    if (unwritten > 0) {
      logger.error('AuditLogService', `Closing with ${unwritten} audit events never written`);
    }
    this.pending = [];
    return unwritten;
  }

  /**
   * Log a login attempt
   */
  async logLoginAttempt(params: {
    success: boolean;
    userEmail: string;
    context?: Context;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { success, ...rest } = params;

    await this.logSecurityEvent({
      ...rest,
      eventType: success ? AuditEventType.LOGIN : AuditEventType.LOGIN_FAILURE,
      severity: success ? AuditEventSeverity.INFO : AuditEventSeverity.WARNING,
      description: success ? 'Successful login' : 'Failed login attempt',
    });
  }

  /**
   * Log a logout event
   */
  async logLogout(params: {
    userEmail: string;
    context?: Context;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.logSecurityEvent({
      eventType: AuditEventType.LOGOUT,
      severity: AuditEventSeverity.INFO,
      description: 'User logged out',
      ...params,
    });
  }

  /**
   * Log a token refresh event
   */
  async logTokenRefresh(params: {
    userEmail: string;
    context?: Context;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.logSecurityEvent({
      eventType: AuditEventType.TOKEN_REFRESH,
      severity: AuditEventSeverity.INFO,
      description: 'Access token refreshed',
      ...params,
    });
  }

  /**
   * Log a token invalidation event
   */
  async logTokenInvalidation(params: {
    userEmail: string;
    context?: Context;
    reason: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { reason, ...rest } = params;

    await this.logSecurityEvent({
      eventType: AuditEventType.TOKEN_INVALIDATION,
      severity: AuditEventSeverity.WARNING,
      description: `Token invalidated: ${reason}`,
      ...rest,
    });
  }

  /**
   * Log a suspicious activity event
   */
  async logSuspiciousActivity(params: {
    userEmail?: string;
    context?: Context;
    description: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.logSecurityEvent({
      eventType: AuditEventType.SUSPICIOUS_ACTIVITY,
      severity: AuditEventSeverity.WARNING,
      ...params,
    });
  }

  /**
   * Log a rate limit exceeded event
   */
  async logRateLimitExceeded(params: {
    userEmail?: string;
    context?: Context;
    limit: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { limit, ...rest } = params;

    await this.logSecurityEvent({
      eventType: AuditEventType.RATE_LIMIT_EXCEEDED,
      severity: AuditEventSeverity.WARNING,
      description: `Rate limit of ${limit} exceeded`,
      ...rest,
    });
  }

  /**
   * Log an unauthorized access attempt
   */
  async logUnauthorizedAccess(params: {
    userEmail?: string;
    context?: Context;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { reason, ...rest } = params;

    await this.logSecurityEvent({
      eventType: AuditEventType.UNAUTHORIZED_ACCESS,
      severity: AuditEventSeverity.WARNING,
      description: reason || 'Unauthorized access attempt',
      ...rest,
    });
  }

  /**
   * Get recent audit logs
   */
  async getRecentLogs(limit: number = 100): Promise<AuditLog[]> {
    return this.repository.findRecent(limit);
  }

  async getUserLogs(userEmail: string): Promise<AuditLog[]> {
    return this.repository.findByUserId(userEmail);
  }

  async getLogsByEventType(eventType: AuditEventType): Promise<AuditLog[]> {
    return this.repository.findByEventType(eventType);
  }

  async getLogsBySeverity(severity: AuditEventSeverity): Promise<AuditLog[]> {
    return this.repository.findBySeverity(severity);
  }

  /**
   * Delete audit logs past their retention: plain API access records after
   * `apiAccessDays`, every other event after `otherDays`.
   */
  async cleanupOldLogs(
    retention: { apiAccessDays: number; otherDays: number } = {
      apiAccessDays: AUDIT_RETENTION_DAYS.apiAccess,
      otherDays: AUDIT_RETENTION_DAYS.other,
    }
  ): Promise<number> {
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const access = await this.repository.deleteOldLogs(daysAgo(retention.apiAccessDays), {
      eventTypes: [AuditEventType.API_ACCESS],
    });
    const other = await this.repository.deleteOldLogs(daysAgo(retention.otherDays), {
      excludeEventTypes: [AuditEventType.API_ACCESS],
    });
    return access + other;
  }
}
