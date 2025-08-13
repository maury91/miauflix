import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
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

        // Extract user agent for audit logging
        const userAgent = context.req.header('user-agent');

        // Generate tokens
        const authResult = await authService.generateTokens(user, context, userAgent);

        // Set refresh token as session-scoped HttpOnly cookie
        const { name: cookieName, ...cookieOpts } = authService.getCookieConfig(authResult.session);
        setCookie(context, cookieName, authResult.refreshToken, cookieOpts);

        await auditLogService.logLoginAttempt({
          success: true,
          userEmail: email,
          context,
        });

        // Return access token, session, and user info (refresh token is in cookie)
        return context.json({
          accessToken: authResult.accessToken,
          session: authResult.session,
          user: authResult.user,
        } satisfies LoginResponse);
      }
    )
    .post(
      '/refresh/:session',
      rateLimitGuard(0.2), // 1 attempt every 5 seconds
      zValidator('query', z.object({ dry_run: z.string().optional() })),
      async context => {
        const { session } = context.req.param();
        // Get refresh token from session-scoped HttpOnly cookie
        const { name: cookieName, ...cookieOpts } = authService.getCookieConfig(session);
        const refreshToken = getCookie(context, cookieName);

        if (!refreshToken) {
          throw new InvalidTokenError();
        }

        // Check for dry-run mode
        const isDryRun = context.req.valid('query').dry_run === 'true';

        if (isDryRun) {
          // Dry-run mode: validate token without rotation
          const isValid = await authService.validateRefreshToken(refreshToken, session);

          if (!isValid) {
            throw new InvalidTokenError();
          }

          // Return success without rotating token
          return context.json({ valid: true });
        }

        // Extract user agent for audit logging
        const userAgent = context.req.header('user-agent');

        // Refresh tokens with rotation
        const authResult = await authService.refreshTokens(
          refreshToken,
          session,
          context,
          userAgent
        );

        if (!authResult) {
          // Clear invalid cookie
          deleteCookie(context, cookieName);
          throw new InvalidTokenError();
        }

        // Set new refresh token as session-scoped HttpOnly cookie
        setCookie(context, cookieName, authResult.refreshToken, cookieOpts);

        await auditLogService.logTokenRefresh({
          userEmail: authResult.user.email,
          context,
        });

        // Return only access token (new refresh token is in cookie)
        return context.json({
          accessToken: authResult.accessToken,
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

        // Always clear the session-scoped cookie, even if token was invalid
        deleteCookie(context, cookieName);

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

          // Extract user agent for audit logging
          const userAgent = context.req.header('user-agent');

          // Generate tokens
          const authResult = await authService.generateTokens(user, context, userAgent);

          // Set refresh token as session-scoped HttpOnly cookie
          const { name: cookieName, ...cookieOpts } = authService.getCookieConfig(
            authResult.session
          );
          setCookie(context, cookieName, authResult.refreshToken, cookieOpts);

          return context.json({
            accessToken: authResult.accessToken,
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
    );
};
