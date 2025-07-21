import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { UserRole } from '@entities/user.entity';
import { InvalidTokenError } from '@errors/auth.errors';
import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';

import type {
  CreateUserResponse,
  LoginResponse,
  LogoutResponse,
  RefreshResponse,
} from './auth.types';
import type { Deps, ErrorResponse } from './common.types';
import type { DeviceAuthResponse } from './trakt.types';

export const createAuthRoutes = ({ authService, auditLogService, traktService }: Deps) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService);

  return new Hono()
    .post(
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
          return context.json({ error: 'Invalid credentials' } satisfies ErrorResponse, 401);
        }

        const tokens = await authService.generateTokens(user);

        await auditLogService.logLoginAttempt({
          success: true,
          userEmail: email,
          context,
        });

        return context.json(tokens satisfies LoginResponse);
      }
    )
    .post(
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

        return context.json(refreshResponse.tokens satisfies RefreshResponse);
      }
    )
    .post(
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

        return context.json({ message: 'Logged out successfully' } satisfies LogoutResponse);
      }
    )
    .post(
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
        return context.json(
          {
            id: newUser.id,
            email: newUser.email,
            role: newUser.role,
          } satisfies CreateUserResponse,
          201
        );
      }
    )
    .post('/device/trakt', rateLimitGuard(2), async context => {
      try {
        const deviceAuth = await traktService.initiateDeviceAuth();

        return context.json(deviceAuth satisfies DeviceAuthResponse);
      } catch (error) {
        console.error('Trakt device auth initiation failed:', error);
        return context.json(
          {
            error: 'Failed to initiate Trakt authentication',
          } satisfies ErrorResponse,
          500
        );
      }
    })
    .post(
      '/login/trakt',
      rateLimitGuard(1),
      zValidator(
        'json',
        z.object({
          deviceCode: z.string().min(1),
        })
      ),
      async context => {
        const { deviceCode } = context.req.valid('json');

        try {
          const user = await traktService.checkDeviceLogin(deviceCode);
          if (!user) {
            return context.json(
              { error: 'Trakt account not associated with a user' } satisfies ErrorResponse,
              401
            );
          }

          const tokens = await authService.generateTokens(user);
          return context.json(tokens satisfies LoginResponse);
        } catch (error) {
          console.error('Trakt device auth check failed:', error);
          return context.json(
            { error: 'Failed to check Trakt authentication status' } satisfies ErrorResponse,
            401
          );
        }
      }
    );
};
