import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';

import { ENV } from '@constants';
import type { UserRole } from '@entities/user.entity';
import { AuthError, RoleError } from '@errors/auth.errors';
import type { AuthService } from '@services/auth/auth.service';
import { withSpan } from '@utils/tracing.util';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

declare module 'hono' {
  interface ContextVariableMap {
    user?: AuthUser;
  }
}

export const createAuthMiddleware = (authService: AuthService) => {
  const accessTokenCookieName = ENV('ACCESS_TOKEN_COOKIE_NAME');

  return createMiddleware<{
    Variables: {
      user?: AuthUser;
    };
  }>(async (c, next) => {
    return withSpan('AuthMiddleware.verifyToken', async () => {
      const sessionId = c.req.header('X-Session-Id');

      if (sessionId) {
        const cookieName = `${accessTokenCookieName}_${sessionId}`;
        const token = getCookie(c, cookieName);

        if (token) {
          try {
            const payload = await authService.verifyAccessToken(token);

            c.set('user', {
              id: payload.userId,
              email: payload.email,
              role: payload.role as UserRole,
            } satisfies AuthUser);
          } catch {
            // Invalid token, but continue to next middleware
          }
        }
      }

      await next();
    });
  });
};

export const authGuard = (role?: UserRole) => {
  return createMiddleware<{
    Variables: {
      user: AuthUser;
    };
  }>(async (c, next) => {
    const user = c.get('user');
    if (!user) {
      throw new AuthError();
    }

    if (role && user.role !== role) {
      throw new RoleError(role, user.email);
    }

    await next();
  });
};
