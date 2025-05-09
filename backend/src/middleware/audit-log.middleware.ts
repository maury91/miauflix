import { Elysia } from 'elysia';

import { AuditEventSeverity, AuditEventType } from '@entities/audit-log.entity';
import { AuthError, InvalidTokenError, LoginError, RoleError } from '@errors/auth.errors';
import type { AuditLogService } from '@services/security/audit-log.service';

export function createAuditLogMiddleware(auditLogService: AuditLogService) {
  return new Elysia({
    name: 'auditLogMiddleware',
  })
    .onRequest(async ({ request, server }) => {
      // Skip logging for certain paths (like health checks)
      const path = new URL(request.url).pathname;
      if (path === '/health') {
        return;
      }

      // Log the API access
      await auditLogService.logSecurityEvent({
        eventType: AuditEventType.API_ACCESS,
        severity: AuditEventSeverity.INFO,
        description: `${request.method} ${path}`,
        server,
        request,
        metadata: { path },
      });
    })
    .onError({ as: 'global' }, async ({ request, error, server, set }) => {
      if (error instanceof LoginError) {
        set.status = 401;
        await auditLogService.logLoginAttempt({
          success: false,
          userEmail: error.email,
          request,
          server,
        });
        return;
      }

      if (error instanceof AuthError || error instanceof InvalidTokenError) {
        set.status = 401;
        await auditLogService.logUnauthorizedAccess({
          request,
          server,
          reason: error.message,
        });
        return;
      }

      if (error instanceof RoleError) {
        set.status = 401;
        await auditLogService.logUnauthorizedAccess({
          request,
          server,
          reason: error.message,
          userEmail: error.email,
          metadata: {
            role: error.role,
          },
        });
        return;
      }

      const path = new URL(request.url).pathname;

      // Log API errors
      const errorMessage = error instanceof Error ? error.message : String(error);

      const errorDetails =
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : { message: String(error) };

      await auditLogService.logSecurityEvent({
        eventType: AuditEventType.API_ERROR,
        severity: AuditEventSeverity.ERROR,
        description: `API Error: ${errorMessage}`,
        request,
        server,
        metadata: {
          error: errorDetails,
          path,
        },
      });
    });
}
