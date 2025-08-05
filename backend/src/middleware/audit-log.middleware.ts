import { type MiddlewareHandler } from 'hono';

import { AuditEventSeverity, AuditEventType } from '@entities/audit-log.entity';
import { AuthError, InvalidTokenError, LoginError, RoleError } from '@errors/auth.errors';
import type { AuditLogService } from '@services/security/audit-log.service';
import { withSpan } from '@utils/tracing.util';

export function createAuditLogMiddleware(auditLogService: AuditLogService): MiddlewareHandler {
  return async (context, next) => {
    return withSpan(
      'AuditLogMiddleware.process',
      async () => {
        // Skip logging for certain paths (like health checks)
        const path = new URL(context.req.url).pathname;
        if (path === '/health') {
          return await next();
        }

        // Log the API access
        await auditLogService.logSecurityEvent({
          eventType: AuditEventType.API_ACCESS,
          severity: AuditEventSeverity.INFO,
          description: `${context.req.method} ${path}`,
          context: context,
          metadata: { path },
        });

        await next();

        if (context.error) {
          if (context.error instanceof LoginError) {
            context.status(401);
            await auditLogService.logLoginAttempt({
              success: false,
              userEmail: context.error.email,
              context: context,
            });

            return context.json({ error: 'Unauthorized' }, 401);
          }

          if (context.error instanceof AuthError || context.error instanceof InvalidTokenError) {
            context.status(401);
            await auditLogService.logUnauthorizedAccess({
              context: context,
              reason: context.error.message,
            });

            return context.json({ error: 'Unauthorized' }, 401);
          }

          if (context.error instanceof RoleError) {
            context.status(401);
            await auditLogService.logUnauthorizedAccess({
              context: context,
              reason: context.error.message,
              userEmail: context.error.email,
              metadata: {
                role: context.error.role,
              },
            });

            return context.json({ error: 'Unauthorized' }, 401);
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
      { path: new URL(context.req.url).pathname, method: context.req.method }
    );
  };
}
