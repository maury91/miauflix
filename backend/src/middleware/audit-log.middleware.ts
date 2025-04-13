import { Elysia } from "elysia";
import { AuditLogService } from "../services/audit-log.service";
import {
  AuditEventType,
  AuditEventSeverity,
} from "../entities/audit-log.entity";
import { AuthError, LoginError, RoleError } from "src/errors/auth.errors";

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
        metadata: { path },
      });
    })
    .onAfterResponse(
      { as: "global" },
      async ({ path, request, response, server, body }) => {
        switch (path) {
          case "/auth/login":
            if (
              response &&
              typeof body === "object" &&
              body &&
              "email" in body &&
              typeof body.email === "string"
            ) {
              await auditLogService.logLoginAttempt({
                success: true,
                userEmail: body.email,
                request,
                server,
              });
            }
            break;
        }
      },
    )
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

      if (error instanceof AuthError) {
        await auditLogService.logUnauthorizedAccess({
          request,
          server,
          reason: error.message,
        });
        return;
      }

      if (error instanceof RoleError) {
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
