import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { UserRole } from '@entities/user.entity';
import { InvalidTokenError, LoginError } from '@errors/auth.errors';
import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import type { AuthService } from '@services/auth/auth.service';
import type { AuditLogService } from '@services/security/audit-log.service';

export const createAuthRoutes = (authService: AuthService, auditLogService: AuditLogService) => {
  const app = new Hono();
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService);

  app.post(
    '/login',
    rateLimitGuard(1), // 1 attempt per second
    zValidator(
      'json',
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      })
    ),
    async context => {
      const { email, password } = context.req.valid('json');

      const user = await authService.validateUser(email, password);
      if (!user) {
        await auditLogService.logLoginAttempt({
          success: false,
          userEmail: email,
          context,
        });
        throw new LoginError(email);
      }

      const tokens = await authService.generateTokens(user);

      await auditLogService.logLoginAttempt({
        success: true,
        userEmail: email,
        context,
      });

      return context.json(tokens);
    }
  );

  app.post(
    '/refresh',
    rateLimitGuard(0.2), // 1 attempt every 5 seconds
    zValidator(
      'json',
      z.object({
        refreshToken: z.string().min(1),
      })
    ),
    async context => {
      const { refreshToken } = context.req.valid('json');

      const refreshResponse = await authService.refreshAccessToken(refreshToken);

      if (!refreshResponse) {
        throw new InvalidTokenError();
      }

      await auditLogService.logTokenRefresh({
        userEmail: refreshResponse.email,
        context,
      });

      return context.json(refreshResponse.tokens);
    }
  );

  app.post(
    '/logout',
    rateLimitGuard(1), // 1 attempt per second
    zValidator(
      'json',
      z.object({
        refreshToken: z.string().min(1),
      })
    ),
    async context => {
      const { refreshToken } = context.req.valid('json');

      const user = await authService.logout(refreshToken);

      if (user) {
        await auditLogService.logTokenInvalidation({
          userEmail: user.email,
          context,
          reason: 'User logged out',
        });
      }

      return context.json({ message: 'Logged out successfully' });
    }
  );

  app.post(
    '/users',
    authGuard(UserRole.ADMIN),
    rateLimitGuard(1),
    zValidator(
      'json',
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
        role: z.nativeEnum(UserRole),
      })
    ),
    async context => {
      const { email, password, role } = context.req.valid('json');

      const newUser = await authService.createUser(email, password, role as UserRole);

      return context.json({
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
      });
    }
  );

  return app;
};
