import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';

import { UserRole } from '@entities/user.entity';
import { InvalidTokenError, UserAlreadyExistsError } from '@errors/auth.errors';
import { HttpError } from '@errors/http.error';
import { authGuard } from '@middleware/auth.middleware';
import type { AuthResult, AuthService } from '@services/auth/auth.service';
import { LoginThrottle } from '@services/auth/login-throttle';
import { toUserDto } from '@services/auth/user-dto.util';
import { readRefreshToken, wantsTokenTransport } from '@utils/auth-transport.util';
import { setCookies } from '@utils/setCookies.util';

import type {
  AuthTokens,
  CreateUserResponse,
  LoginResponse,
  LogoutResponse,
  RefreshResponse,
  SessionResponse,
} from './auth.types';
import type { RouteDeps } from './common.types';
import { avatarLookSchema, displayNameSchema } from './profile.schema';

/** Set the session cookies, or hand the tokens to a client that asked for token transport. */
function deliverTokens(
  c: Context,
  authService: AuthService,
  { accessToken, refreshToken, ...authResult }: AuthResult
): { tokens?: AuthTokens } {
  if (wantsTokenTransport(c, authService.getSessionCookiePrefixes()))
    return { tokens: { accessToken, refreshToken } };
  setCookies(c, authService.getCookies({ accessToken, refreshToken, ...authResult }));
  return {};
}

export const createAuthRoutes = ({
  rateLimitGuard,
  authService,
  auditLogService,
  qrLoginService,
}: RouteDeps) => {
  const loginThrottle = new LoginThrottle();

  return new Hono()
    .get('/setup', rateLimitGuard(0.5), async c => {
      const available = await authService.isSetupAvailable();
      return c.json({ available });
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
      async c => {
        const { email, password } = c.req.valid('json');
        const user = await authService.setupAdmin(email, password, c).catch((error: unknown) => {
          if (error instanceof Error && error.message === 'Admin user already exists') return null;
          throw error;
        });
        // Same answer either way: do not leak that the first admin can be created here.
        if (!user) throw new HttpError(404, 'Not found');
        // Auto-login: generate tokens so the frontend gets a session immediately
        const authResult = await authService.generateTokens(user, c);
        const delivered = deliverTokens(c, authService, authResult);
        return c.json(
          {
            session: authResult.session,
            user: authResult.user,
            ...delivered,
          } satisfies LoginResponse,
          201
        );
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
      async c => {
        const { email, password } = c.req.valid('json');

        // Per account, on top of the per-IP limit: guesses spread over many addresses add up here
        const retryAfter = loginThrottle.begin(email);
        if (retryAfter > 0) {
          await auditLogService.logSuspiciousActivity({
            userEmail: email,
            context: c,
            description: 'Login refused: too many failed attempts for this account',
          });
          c.header('Retry-After', String(retryAfter));
          throw new HttpError(429, 'Too many failed login attempts. Try again later.');
        }

        let user: Awaited<ReturnType<typeof authService.validateUser>>;
        try {
          user = await authService.validateUser(email, password);
        } catch (error) {
          loginThrottle.release(email);
          throw error;
        }
        if (!user) {
          loginThrottle.fail(email);
          await auditLogService.logLoginAttempt({
            success: false,
            userEmail: email,
            context: c,
          });
          throw new HttpError(401, 'Invalid credentials');
        }
        loginThrottle.succeed(email);

        // Generate tokens
        const authResult = await authService.generateTokens(user, c);

        // Set authentication cookies (or return the tokens to a token-transport client)
        const delivered = deliverTokens(c, authService, authResult);

        await auditLogService.logLoginAttempt({
          success: true,
          userEmail: email,
          context: c,
        });

        // Return session and user info (tokens are in cookies unless token transport was asked)
        return c.json({
          session: authResult.session,
          user: authResult.user,
          ...delivered,
        } satisfies LoginResponse);
      }
    )
    .post(
      '/refresh/:session',
      rateLimitGuard(0.2), // 1 attempt every 5 seconds
      async c => {
        const { session } = c.req.param();
        // Get refresh token from session-scoped HttpOnly cookie (or X-Refresh-Token)
        const { name: cookieName } = authService.getCookieConfig(session);
        const refreshToken = readRefreshToken(c, cookieName);

        if (!refreshToken) {
          throw new InvalidTokenError();
        }

        // Refresh tokens with rotation
        const authResult = await authService.refreshTokens(refreshToken, session, c);

        if (!authResult) {
          // Clear invalid cookies
          authService.clearCookies(c, session);
          throw new InvalidTokenError();
        }

        // Set authentication cookies (or return the tokens to a token-transport client)
        const delivered = deliverTokens(c, authService, authResult);

        await auditLogService.logTokenRefresh({
          userEmail: authResult.user.email,
          context: c,
        });

        // Return user info (tokens are in cookies unless token transport was asked)
        return c.json({
          user: authResult.user,
          ...delivered,
        } satisfies RefreshResponse);
      }
    )
    .post(
      '/logout/:session',
      rateLimitGuard(1), // 1 attempt per second
      async c => {
        const { session } = c.req.param();
        // Get refresh token from session-scoped HttpOnly cookie (or X-Refresh-Token)
        const { name: cookieName } = authService.getCookieConfig(session);
        const refreshToken = readRefreshToken(c, cookieName);

        if (refreshToken) {
          const user = await authService.logout(refreshToken, session);

          if (user) {
            await auditLogService.logTokenInvalidation({
              userEmail: user.email,
              context: c,
              reason: 'User logged out',
            });
          }
        }

        // Clear cookies for this specific session only
        authService.clearCookies(c, session);

        return c.json({ message: 'Logged out successfully' } satisfies LogoutResponse);
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
          password: z.string().min(8),
          role: z.enum(UserRole),
          displayName: displayNameSchema.optional(),
          avatar: avatarLookSchema.optional(),
        })
      ),
      async c => {
        const { email, password, role, displayName, avatar } = c.req.valid('json');

        let newUser: Awaited<ReturnType<typeof authService.createUser>>;
        try {
          newUser = await authService.createUser(email, password, role, { displayName, avatar });
        } catch (error) {
          if (error instanceof UserAlreadyExistsError) {
            throw new HttpError(409, 'An account with this email already exists');
          }
          throw error;
        }
        return c.json(toUserDto(newUser) satisfies CreateUserResponse, 201);
      }
    )
    .post('/qr', rateLimitGuard(2), async c => {
      return c.json(await qrLoginService.create(c));
    })
    .get('/qr/:approvalToken', rateLimitGuard(10), async c => {
      const request = await qrLoginService.getApproval(c.req.param('approvalToken'));
      if (!request) throw new HttpError(404, 'QR login request not found');
      if (request.expiresAt <= new Date()) {
        return c.json({ state: 'expired', expiresAt: request.expiresAt.toISOString() });
      }
      return c.json({
        state: request.state,
        expiresAt: request.expiresAt.toISOString(),
        device: { userAgent: request.userAgent },
      });
    })
    .post('/qr/:approvalToken/approve', rateLimitGuard(1), authGuard(), async c => {
      const { user } = c.get('sessionInfo');
      const request = await qrLoginService.approve(c.req.param('approvalToken'), user.id);
      if (!request) throw new HttpError(409, 'QR login request is no longer pending');
      return c.json({ state: 'approved' as const });
    })
    .post('/qr/:approvalToken/reject', rateLimitGuard(1), authGuard(), async c => {
      const rejected = await qrLoginService.reject(c.req.param('approvalToken'));
      if (!rejected) throw new HttpError(409, 'QR login request is no longer pending');
      return c.json({ state: 'rejected' as const });
    })
    .post(
      '/qr/:requestId/claim',
      rateLimitGuard(1),
      zValidator('json', z.object({ claimToken: z.string().min(32) })),
      async c => {
        const { claimToken } = c.req.valid('json');
        const claim = await qrLoginService.beginClaim(claimToken, c.req.param('requestId'));
        if (!claim) {
          return c.json({ state: 'pending' as const }, 202);
        }
        const { request, lease } = claim;
        let authResult!: Awaited<ReturnType<typeof authService.generateTokens>>;
        try {
          if (!request.approvedUserId) {
            await qrLoginService.releaseClaim(request.id, lease);
            throw new HttpError(409, 'QR login request has no approving user');
          }
          const user = await authService.getUserById(request.approvedUserId);
          if (!user) {
            await qrLoginService.releaseClaim(request.id, lease);
            throw new HttpError(409, 'Approving user no longer exists');
          }
          authResult = await authService.generateTokens(user, c);
          const completed = await qrLoginService.completeClaim(request.id, lease);
          if (!completed) {
            await authService.revokeSession(user.id, authResult.session);
            await qrLoginService.releaseClaim(request.id, lease);
            return c.json({ state: 'pending' as const }, 202);
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
        const delivered = deliverTokens(c, authService, authResult);
        return c.json({
          session: authResult.session,
          user: authResult.user,
          ...delivered,
        } satisfies LoginResponse);
      }
    )
    .get(
      '/sessions',
      rateLimitGuard(0.5), // 1 request every 2 seconds (sensitive endpoint)
      async c => {
        const sessions = await authService.getSessionsFromCookies(c);
        return c.json(sessions);
      }
    )
    .get('/session', authGuard(), async c => {
      const sessionInfo = c.get('sessionInfo');
      const user = await authService.getUserById(sessionInfo.user.id);
      if (!user) {
        throw new InvalidTokenError();
      }

      return c.json({
        id: sessionInfo.sessionId,
        user: toUserDto(user),
      } satisfies SessionResponse);
    });
};
