import { Elysia, t } from "elysia";

import { UserRole } from "@entities/user.entity";
import { InvalidTokenError, LoginError } from "@errors/auth.errors";
import { createAuthMiddleware } from "@middleware/auth.middleware";
import { createRateLimitMiddleware } from "@middleware/rate-limit.middleware";
import type { AuthService } from "@services/auth/auth.service";
import type { AuditLogService } from "@services/security/audit-log.service";

export const createAuthRoutes = (
  authService: AuthService,
  auditLogService: AuditLogService,
) => {
  return new Elysia()
    .use(createAuthMiddleware(authService))
    .use(createRateLimitMiddleware(auditLogService))
    .group("/auth", (app) =>
      app
        .post(
          "/login",
          async ({ body: { email, password }, request, server, set }) => {
            const user = await authService.validateUser(email, password);
            if (!user) {
              set.status = 401;
              throw new LoginError(email);
            }
            const tokens = await authService.generateTokens(user);

            await auditLogService.logLoginAttempt({
              success: true,
              userEmail: email,
              request,
              server,
            });
            return tokens;
          },
          {
            body: t.Object({
              email: t.String({ format: "email" }),
              password: t.String(),
            }),
            rateLimit: 1, // 1 attempt per second
          },
        )
        .post(
          "/refresh",
          async ({ body, request, server, set }) => {
            const { refreshToken } = body;
            const refreshResponse =
              await authService.refreshAccessToken(refreshToken);

            if (!refreshResponse) {
              set.status = 401;
              throw new InvalidTokenError();
            }

            await auditLogService.logTokenRefresh({
              userEmail: refreshResponse.email,
              request,
              server,
            });
            return refreshResponse.tokens;
          },
          {
            body: t.Object({
              refreshToken: t.String(),
            }),
            rateLimit: 0.2, // 1 attempt every 5 seconds
          },
        )
        .post(
          "/logout",
          async ({ body, request, server }) => {
            const { refreshToken } = body;
            const user = await authService.logout(refreshToken);

            if (user) {
              await auditLogService.logTokenInvalidation({
                userEmail: user.email,
                request,
                server,
                reason: "User logged out",
              });
            }
            return { message: "Logged out successfully" };
          },
          {
            body: t.Object({
              refreshToken: t.String(),
            }),
            rateLimit: 1, // 1 attempt per second
          },
        )
        .post(
          "/users",
          async ({ body }) => {
            const { email, password, role } = body;
            const newUser = await authService.createUser(email, password, role);
            return {
              id: newUser.id,
              email: newUser.email,
              role: newUser.role,
            };
          },
          {
            isAuth: UserRole.ADMIN,
            body: t.Object({
              email: t.String({ format: "email" }),
              password: t.String({ minLength: 8 }),
              role: t.Enum(UserRole),
            }),
            rateLimit: 1, // 1 attempt per second
          },
        ),
    );
};
