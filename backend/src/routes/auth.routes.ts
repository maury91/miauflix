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

export const createAuthRoutes = ({
  authService,
  auditLogService,
  configurationService,
  qrLoginService,
}: Deps) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService, configurationService);

  return new Hono()
    .get('/setup', rateLimitGuard(0.5), async context => {
      const available = await authService.isSetupAvailable();
      return context.json({ available });
    })
    .post(
      '/setup',
      rateLimitGuard(0.2), // 1 request per 5 seconds
      zValidator(
        'json',
        z.object({
          email: z.string().email(),
          password: z.string().min(8),
        })
      ),
      async context => {
        const { email, password } = context.req.valid('json');
        try {
          const user = await authService.setupAdmin(email, password, context);
          if (!user) {
            return context.json({ error: 'Not found' } satisfies ErrorResponse, 404);
          }
          // Auto-login: generate tokens so the frontend gets a session immediately
          const authResult = await authService.generateTokens(user, context);
          setCookies(context, authService.getCookies(authResult));
          return context.json(
            {
              session: authResult.session,
              user: authResult.user,
            } satisfies LoginResponse,
            201
          );
        } catch (error: unknown) {
          if (error instanceof Error && error.message === 'Admin user already exists') {
            // We do not want to leak that the service was initialized with the allowCreateAdminOnFirstRun enabled
            return context.json({ error: 'Not found' } satisfies ErrorResponse, 404);
          }
          return context.json({ error: 'Internal server error' } satisfies ErrorResponse, 500);
        }
      }
    )
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
    .post('/qr', rateLimitGuard(2), async context => {
      return context.json(await qrLoginService.create(context));
    })
    .get('/qr/:approvalToken', rateLimitGuard(10), async context => {
      const request = await qrLoginService.getApproval(context.req.param('approvalToken'));
      if (!request) return context.json({ error: 'QR login request not found' }, 404);
      if (request.expiresAt <= new Date()) {
        return context.json({ state: 'expired', expiresAt: request.expiresAt.toISOString() });
      }
      return context.json({
        state: request.state,
        expiresAt: request.expiresAt.toISOString(),
        device: { userAgent: request.userAgent },
      });
    })
    .post('/qr/:approvalToken/approve', rateLimitGuard(1), authGuard(), async context => {
      const { user } = context.get('sessionInfo');
      const request = await qrLoginService.approve(context.req.param('approvalToken'), user.id);
      if (!request) return context.json({ error: 'QR login request is no longer pending' }, 409);
      return context.json({ state: 'approved' as const });
    })
    .post('/qr/:approvalToken/reject', rateLimitGuard(1), authGuard(), async context => {
      const rejected = await qrLoginService.reject(context.req.param('approvalToken'));
      return rejected
        ? context.json({ state: 'rejected' as const })
        : context.json({ error: 'QR login request is no longer pending' }, 409);
    })
    .post(
      '/qr/:requestId/claim',
      rateLimitGuard(1),
      zValidator('json', z.object({ claimToken: z.string().min(32) })),
      async context => {
        const { claimToken } = context.req.valid('json');
        const claim = await qrLoginService.beginClaim(claimToken, context.req.param('requestId'));
        if (!claim) {
          return context.json({ state: 'pending' as const }, 202);
        }
        const { request, lease } = claim;
        let authResult!: Awaited<ReturnType<typeof authService.generateTokens>>;
        try {
          if (!request.approvedUserId) {
            await qrLoginService.releaseClaim(request.id, lease);
            return context.json({ error: 'QR login request has no approving user' }, 409);
          }
          const user = await authService.getUserById(request.approvedUserId);
          if (!user) {
            await qrLoginService.releaseClaim(request.id, lease);
            return context.json({ error: 'Approving user no longer exists' }, 409);
          }
          authResult = await authService.generateTokens(user, context);
          const completed = await qrLoginService.completeClaim(request.id, lease);
          if (!completed) {
            await authService.revokeSession(user.id, authResult.session);
            await qrLoginService.releaseClaim(request.id, lease);
            return context.json({ state: 'pending' as const }, 202);
          }
        } catch (error) {
          try {
            if (authResult) {
              await authService.revokeSession(authResult.user.id, authResult.session);
            }
          } finally {
            await qrLoginService.releaseClaim(request.id, lease);
          }
          throw error;
        }
        setCookies(context, authService.getCookies(authResult));
        return context.json({
          session: authResult.session,
          user: authResult.user,
        } satisfies LoginResponse);
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
