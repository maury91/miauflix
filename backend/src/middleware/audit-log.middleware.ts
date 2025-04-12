import { Elysia } from "elysia";
import { AuditLogService } from "../services/audit-log.service";
import {
  AuditEventType,
  AuditEventSeverity,
} from "../entities/audit-log.entity";
import { LoginError } from "src/errors/auth.errors";

export function createAuditLogMiddleware(auditLogService: AuditLogService) {
  return new Elysia({
    name: "auditLogMiddleware",
  })
    .onRequest(async ({ request, server }) => {
      // Skip logging for certain paths (like health checks)
      const path = new URL(request.url).pathname;
      if (path === "/health") {
        return;
      }

      // Log the API access
      await auditLogService.logSecurityEvent({
        eventType: AuditEventType.API_ACCESS,
        severity: AuditEventSeverity.INFO,
        description: `${request.method} ${path}`,
        server,
        request,
        metadata: {
          method: request.method,
          path,
          query: Object.fromEntries(new URL(request.url).searchParams),
          headers: Object.fromEntries(request.headers),
        },
      });
    })
    .onAfterResponse(async ({ path, request, response, server }) => {
      console.log(path, request, response, server);
    })
    .onError({ as: "global" }, async ({ request, error, server }) => {
      console.log("error!", error);
      if (error instanceof LoginError) {
        await auditLogService.logLoginAttempt({
          success: false,
          userEmail: error.email,
          request,
          server,
        });
        return;
      }

      // Log API errors
      const errorMessage =
        error instanceof Error ? error.message : String(error);

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
        },
      });
    });
}
