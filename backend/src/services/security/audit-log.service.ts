import type { Context } from "elysia";

import { Database } from "@database/database";
import { AuditLogRepository } from "@repositories/audit-log.repository";
import { AuditEventType, AuditEventSeverity } from "@entities/audit-log.entity";

export class AuditLogService {
  private repository: AuditLogRepository;

  constructor(db: Database) {
    this.repository = db.getAuditLogRepository();
  }

  /**
   * Log a security event
   */
  async logSecurityEvent(params: {
    eventType: AuditEventType;
    severity?: AuditEventSeverity;
    description?: string;
    request?: Context["request"];
    server?: Context["server"];
    userEmail?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const {
      eventType,
      severity,
      description,
      request,
      server,
      userEmail,
      metadata,
    } = params;
    const ipAddress = request ? server?.requestIP(request)?.address : undefined;
    const userAgent = request?.headers.get("user-agent") || undefined;

    const logData = {
      eventType,
      severity,
      description,
      userEmail,
      metadata: {
        ...(request && {
          method: request.method,
          query: Object.fromEntries(new URL(request.url).searchParams),
          headers: Object.fromEntries(request.headers),
        }),
        ...metadata,
      },
      ipAddress,
      userAgent,
    };

    await this.repository.create(logData);
  }

  /**
   * Log a login attempt
   */
  async logLoginAttempt(params: {
    success: boolean;
    userEmail: string;
    request: Context["request"];
    server: Context["server"];
    metadata?: Record<string, any>;
  }): Promise<void> {
    const { success, ...rest } = params;

    await this.logSecurityEvent({
      ...rest,
      eventType: success ? AuditEventType.LOGIN : AuditEventType.LOGIN_FAILURE,
      severity: success ? AuditEventSeverity.INFO : AuditEventSeverity.WARNING,
      description: success ? "Successful login" : "Failed login attempt",
    });
  }

  /**
   * Log a logout event
   */
  async logLogout(params: {
    userEmail: string;
    request: Context["request"];
    server: Context["server"];
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.logSecurityEvent({
      eventType: AuditEventType.LOGOUT,
      severity: AuditEventSeverity.INFO,
      description: "User logged out",
      ...params,
    });
  }

  /**
   * Log a token refresh event
   */
  async logTokenRefresh(params: {
    userEmail: string;
    request: Context["request"];
    server: Context["server"];
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.logSecurityEvent({
      eventType: AuditEventType.TOKEN_REFRESH,
      severity: AuditEventSeverity.INFO,
      description: "Access token refreshed",
      ...params,
    });
  }

  /**
   * Log a token invalidation event
   */
  async logTokenInvalidation(params: {
    userEmail: string;
    request: Context["request"];
    server: Context["server"];
    reason: string;
    metadata?: Record<string, any>;
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
    request: Context["request"];
    server: Context["server"];
    description: string;
    metadata?: Record<string, any>;
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
    request: Context["request"];
    server: Context["server"];
    limit: number;
    metadata?: Record<string, any>;
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
    request: Context["request"];
    server: Context["server"];
    reason?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const { reason, ...rest } = params;

    await this.logSecurityEvent({
      eventType: AuditEventType.UNAUTHORIZED_ACCESS,
      severity: AuditEventSeverity.WARNING,
      description: reason || "Unauthorized access attempt",
      ...rest,
    });
  }

  /**
   * Get recent audit logs
   */
  async getRecentLogs(limit: number = 100): Promise<any[]> {
    return this.repository.findRecent(limit);
  }

  /**
   * Get audit logs for a specific user
   */
  async getUserLogs(userEmail: string): Promise<any[]> {
    return this.repository.findByUserId(userEmail);
  }

  /**
   * Get audit logs by event type
   */
  async getLogsByEventType(eventType: AuditEventType): Promise<any[]> {
    return this.repository.findByEventType(eventType);
  }

  /**
   * Get audit logs by severity
   */
  async getLogsBySeverity(severity: AuditEventSeverity): Promise<any[]> {
    return this.repository.findBySeverity(severity);
  }

  /**
   * Clean up old audit logs
   */
  async cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    return this.repository.deleteOldLogs(cutoffDate);
  }
}
