import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';
import { z } from 'zod';

import { UserRole } from '@entities/user.entity';
import { InvalidTokenError } from '@errors/auth.errors';
import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import { setCookies } from '@utils/setCookies.util';

import type {
  CreateUserResponse,
  LoginResponse,
  LogoutResponse,
  RefreshResponse,
  SessionResponse,
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

        // Generate tokens
        const authResult = await authService.generateTokens(user, context);

        // Set authentication cookies
        setCookies(context, authService.getCookies(authResult));

        await auditLogService.logLoginAttempt({
          success: true,
          userEmail: email,
          context,
        });

        // Return session and user info (tokens are in cookies)
        return context.json({
          session: authResult.session,
          user: authResult.user,
        } satisfies LoginResponse);
      }
    )
    .post(
      '/refresh/:session',
      rateLimitGuard(0.2), // 1 attempt every 5 seconds
      async context => {
        const { session } = context.req.param();
        // Get refresh token from session-scoped HttpOnly cookie
        const { name: cookieName } = authService.getCookieConfig(session);
        const refreshToken = getCookie(context, cookieName);

        if (!refreshToken) {
          throw new InvalidTokenError();
        }

        // Refresh tokens with rotation
        const authResult = await authService.refreshTokens(refreshToken, session, context);

        if (!authResult) {
          // Clear invalid cookies
          deleteCookie(context, cookieName);
          const { name: accessCookieName } = authService.getAccessTokenCookieConfig(session);
          deleteCookie(context, accessCookieName);
          throw new InvalidTokenError();
        }

        // Set authentication cookies
        setCookies(context, authService.getCookies(authResult));

        await auditLogService.logTokenRefresh({
          userEmail: authResult.user.email,
          context,
        });

        // Return user info (tokens are in cookies)
        return context.json({
          user: authResult.user,
        } satisfies RefreshResponse);
      }
    )
    .post(
      '/logout/:session',
      rateLimitGuard(1), // 1 attempt per second
      async context => {
        const { session } = context.req.param();
        // Get refresh token from session-scoped HttpOnly cookie
        const { name: cookieName } = authService.getCookieConfig(session);
        const refreshToken = getCookie(context, cookieName);

        if (refreshToken) {
          const user = await authService.logout(refreshToken, session);

          if (user) {
            await auditLogService.logTokenInvalidation({
              userEmail: user.email,
              context,
              reason: 'User logged out',
            });
          }
        }

        // Clear cookies for this specific session only
        deleteCookie(context, cookieName);
        const { name: accessCookieName } = authService.getAccessTokenCookieConfig(session);
        deleteCookie(context, accessCookieName);

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
          email: z.email(),
          password: z.string().min(1),
          role: z.enum(UserRole),
        })
      ),
      async context => {
        const { email, password, role } = context.req.valid('json');

        const newUser = await authService.createUser(email, password, role);
        return context.json(
          {
            id: newUser.id,
            email: newUser.email,
            displayName: newUser.displayName,
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

          // Generate tokens
          const authResult = await authService.generateTokens(user, context);

          // Set authentication cookies
          setCookies(context, authService.getCookies(authResult));

          return context.json({
            session: authResult.session,
            user: authResult.user,
          } satisfies LoginResponse);
        } catch (error) {
          console.error('Trakt device auth check failed:', error);
          return context.json(
            { error: 'Failed to check Trakt authentication status' } satisfies ErrorResponse,
            401
          );
        }
      }
    )
    .get(
      '/sessions',
      rateLimitGuard(0.5), // 1 request every 2 seconds (sensitive endpoint)
      async context => {
        const sessions = await authService.getSessionsFromCookies(context);
        return context.json(sessions);
      }
    )
    .get('/session', authGuard(), async context => {
      const sessionInfo = context.get('sessionInfo');
      const user = await authService.getUserById(sessionInfo.user.id);
      if (!user) {
        throw new InvalidTokenError();
      }

      return context.json({
        id: sessionInfo.sessionId,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
        },
      } satisfies SessionResponse);
    });
};
