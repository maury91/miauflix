import { type MiddlewareHandler } from 'hono';

import { AuditEventSeverity, AuditEventType } from '@entities/audit-log.entity';
import { AuthError, InvalidTokenError, RoleError } from '@errors/auth.errors';
import type { AuditLogService } from '@services/security/audit-log.service';
import { redactPath } from '@utils/redact.util';
import { withSpan } from '@utils/tracing.util';

export function createAuditLogMiddleware(auditLogService: AuditLogService): MiddlewareHandler {
  return async (c, next) => {
    return withSpan(
      'AuditLogMiddleware.process',
      async () => {
        // Skip logging for certain paths (like health checks)
        const path = new URL(c.req.url).pathname;
        if (path === '/api/health') {
          return await next();
        }

        // Queued, not awaited: the request must not wait on the database to be audited.
        void auditLogService.logSecurityEvent({
          eventType: AuditEventType.API_ACCESS,
          severity: AuditEventSeverity.INFO,
          description: `${c.req.method} ${redactPath(path)}`,
          context: c,
          metadata: { path },
        });

        await next();

        // The response itself comes from the app's onError handler; this only records the error.
        if (c.error) {
          if (c.error instanceof AuthError || c.error instanceof InvalidTokenError) {
            await auditLogService.logUnauthorizedAccess({
              context: c,
              reason: c.error.message,
            });
            return;
          }

          if (c.error instanceof RoleError) {
            await auditLogService.logUnauthorizedAccess({
              context: c,
              reason: c.error.message,
              userEmail: c.error.email,
              metadata: {
                role: c.error.role,
              },
            });
            return;
          }

          // Log API errors
          const errorMessage = c.error instanceof Error ? c.error.message : String(c.error);

          const errorDetails =
            c.error instanceof Error
              ? {
                  message: c.error.message,
                  stack: c.error.stack,
                  name: c.error.name,
                }
              : { message: String(c.error) };

          await auditLogService.logSecurityEvent({
            eventType: AuditEventType.API_ERROR,
            severity: AuditEventSeverity.ERROR,
            description: `API Error: ${errorMessage}`,
            context: c,
            metadata: {
              path,
              error: errorDetails,
            },
          });
        }
      },
      { path: redactPath(new URL(c.req.url).pathname), method: c.req.method }
    );
  };
}
