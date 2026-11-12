import { type MiddlewareHandler } from 'hono';

import { AuditEventSeverity, AuditEventType } from '@entities/audit-log.entity';
import { AuthError, InvalidTokenError, RoleError } from '@errors/auth.errors';
import type { AuditLogService } from '@services/security/audit-log.service';
import { redactPath } from '@utils/redact.util';
import { withSpan } from '@utils/tracing.util';

export function createAuditLogMiddleware(auditLogService: AuditLogService): MiddlewareHandler {
  return async (context, next) => {
    return withSpan(
      'AuditLogMiddleware.process',
      async () => {
        // Skip logging for certain paths (like health checks)
        const path = new URL(context.req.url).pathname;
        if (path === '/api/health') {
          return await next();
        }

        // Queued, not awaited: the request must not wait on the database to be audited.
        void auditLogService.logSecurityEvent({
          eventType: AuditEventType.API_ACCESS,
          severity: AuditEventSeverity.INFO,
          description: `${context.req.method} ${redactPath(path)}`,
          context: context,
          metadata: { path },
        });

        await next();

        // The response itself comes from the app's onError handler; this only records the error.
        if (context.error) {
          if (context.error instanceof AuthError || context.error instanceof InvalidTokenError) {
            await auditLogService.logUnauthorizedAccess({
              context: context,
              reason: context.error.message,
            });
            return;
          }

          if (context.error instanceof RoleError) {
            await auditLogService.logUnauthorizedAccess({
              context: context,
              reason: context.error.message,
              userEmail: context.error.email,
              metadata: {
                role: context.error.role,
              },
            });
            return;
          }

          // Log API errors
          const errorMessage =
            context.error instanceof Error ? context.error.message : String(context.error);

          const errorDetails =
            context.error instanceof Error
              ? {
                  message: context.error.message,
                  stack: context.error.stack,
                  name: context.error.name,
                }
              : { message: String(context.error) };

          await auditLogService.logSecurityEvent({
            eventType: AuditEventType.API_ERROR,
            severity: AuditEventSeverity.ERROR,
            description: `API Error: ${errorMessage}`,
            context: context,
            metadata: {
              path,
              error: errorDetails,
            },
          });
        }
      },
      { path: redactPath(new URL(context.req.url).pathname), method: context.req.method }
    );
  };
}
