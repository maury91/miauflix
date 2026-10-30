import { createMiddleware } from 'hono/factory';

import type { UserRole } from '@entities/user.entity';
import { AuthError, RoleError } from '@errors/auth.errors';
import type { UserDto } from '@routes/auth.types';
import type { AuthService } from '@services/auth/auth.service';
import { readAccessToken } from '@utils/auth-transport.util';
import { withSpan } from '@utils/tracing.util';

export interface SessionInfo {
  user: Pick<UserDto, 'email' | 'id' | 'role'>;
  sessionId: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    sessionInfo?: SessionInfo;
  }
}

export const createAuthMiddleware = (
  authService: AuthService,
  accessTokenCookieName: () => string
) => {
  return createMiddleware<{
    Variables: {
      sessionInfo?: SessionInfo;
    };
  }>(async (c, next) => {
    return withSpan('AuthMiddleware.verifyToken', async () => {
      const sessionId = c.req.header('X-Session-Id');

      if (sessionId) {
        const cookieName = `${accessTokenCookieName()}_${sessionId}`;
        // The session cookie, or `Authorization: Bearer` from token-transport clients (the TV app)
        const token = readAccessToken(c, cookieName);

        if (token) {
          try {
            const payload = await authService.verifyAccessToken(token);

            c.set('sessionInfo', {
              sessionId,
              user: {
                id: payload.userId,
                email: payload.email,
                role: payload.role as UserRole,
              },
            });
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
      sessionInfo: SessionInfo;
    };
  }>(async (c, next) => {
    const sessionInfo = c.get('sessionInfo');
    if (!sessionInfo) {
      throw new AuthError();
    }

    if (role && sessionInfo.user.role !== role) {
      throw new RoleError(role, sessionInfo.user.email);
    }

    await next();
  });
};
