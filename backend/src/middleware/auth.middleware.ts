import { createMiddleware } from 'hono/factory';

import type { UserRole } from '@entities/user.entity';
import { AuthError, RoleError } from '@errors/auth.errors';
import type { AuthService } from '@services/auth/auth.service';

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
  return createMiddleware<{
    Variables: {
      user?: AuthUser;
    };
  }>(async (c, next) => {
    const authorization = c.req.header('authorization');

    if (authorization?.startsWith('Bearer ')) {
      const token = authorization.substring('Bearer '.length);

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

    await next();
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
