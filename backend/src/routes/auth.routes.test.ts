jest.mock('@middleware/auth.middleware', () => ({
  // Every request counts as an admin's: these tests are about the routes' own checks
  authGuard: () => async (_context: unknown, next: () => Promise<void>) => next(),
}));
import { noRateLimit } from '@__test-utils__/routes';
import { Hono } from 'hono';

import { UserRole } from '@entities/user.entity';
import { InvalidTokenError, UserAlreadyExistsError } from '@errors/auth.errors';
import { handleError } from '@middleware/error-handler.middleware';

import { createAuthRoutes } from './auth.routes';

const user = { id: 'user-1', email: 'user@example.com', displayName: 'User', role: UserRole.USER };
const authResult = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  session: 'session-1',
  user,
};

const setupTest = () => {
  const authService = {
    validateUser: jest.fn().mockResolvedValue(user),
    createUser: jest.fn(),
    generateTokens: jest.fn().mockResolvedValue(authResult),
    refreshTokens: jest.fn().mockResolvedValue(authResult),
    logout: jest.fn().mockResolvedValue(user),
    clearCookies: jest.fn(),
    getCookieConfig: (session: string) => ({ name: `__rt_${session}` }),
    getSessionCookiePrefixes: () => ['__rt', '__at'],
    getCookies: jest.fn(() => [
      { name: '__at_session-1', value: 'access-token', path: '/', httpOnly: true },
      { name: '__rt_session-1', value: 'refresh-token', path: '/api/auth/', httpOnly: true },
    ]),
  };
  const auditLogService = {
    logLoginAttempt: jest.fn(),
    logTokenRefresh: jest.fn(),
    logTokenInvalidation: jest.fn(),
    logSuspiciousActivity: jest.fn(),
  };
  const app = new Hono();
  app.onError(handleError);
  app.route(
    '/auth',
    createAuthRoutes({
      rateLimitGuard: noRateLimit,
      authService,
      auditLogService,
      configurationService: { get: () => undefined },
      qrLoginService: {},
    } as never)
  );
  return { app, authService };
};

const login = (app: Hono, headers: Record<string, string> = {}) =>
  app.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ email: user.email, password: 'secret' }),
  });

describe('auth routes token transport', () => {
  it('keeps the tokens in cookies for browsers', async () => {
    const { app } = setupTest();
    const response = await login(app);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ session: 'session-1', user });
    expect(response.headers.get('Set-Cookie')).toContain('__rt_session-1=refresh-token');
  });

  it('returns the tokens in the body, without cookies, when token transport is asked', async () => {
    const { app } = setupTest();
    const response = await login(app, { 'X-Auth-Transport': 'token' });
    expect(await response.json()).toEqual({
      session: 'session-1',
      user,
      tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
    });
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });

  it('refreshes with the refresh token from X-Refresh-Token', async () => {
    const { app, authService } = setupTest();
    const response = await app.request('/auth/refresh/session-1', {
      method: 'POST',
      headers: { 'X-Auth-Transport': 'token', 'X-Refresh-Token': 'stored-refresh' },
    });
    expect(response.status).toBe(200);
    expect(authService.refreshTokens).toHaveBeenCalledWith(
      'stored-refresh',
      'session-1',
      expect.anything()
    );
    expect(await response.json()).toEqual({
      user,
      tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
    });
  });

  it('sets cookies instead of returning tokens when the refresh token came from a cookie', async () => {
    const { app, authService } = setupTest();
    const response = await app.request('/auth/refresh/session-1', {
      method: 'POST',
      headers: { 'X-Auth-Transport': 'token', Cookie: '__rt_session-1=cookie-refresh' },
    });
    expect(response.status).toBe(200);
    expect(authService.refreshTokens).toHaveBeenCalledWith(
      'cookie-refresh',
      'session-1',
      expect.anything()
    );
    expect(await response.json()).toEqual({ user });
    expect(response.headers.get('Set-Cookie')).toContain('__rt_session-1=refresh-token');
  });

  it('rejects a refresh without a refresh token', async () => {
    const { app } = setupTest();
    const response = await app.request('/auth/refresh/session-1', { method: 'POST' });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: new InvalidTokenError().code });
  });

  it('logs out the session of the refresh token from X-Refresh-Token', async () => {
    const { app, authService } = setupTest();
    await app.request('/auth/logout/session-1', {
      method: 'POST',
      headers: { 'X-Refresh-Token': 'stored-refresh' },
    });
    expect(authService.logout).toHaveBeenCalledWith('stored-refresh', 'session-1');
  });
});

describe('auth routes account creation', () => {
  const setupAdminApp = () => {
    const created = {
      ...user,
      id: 'user-2',
      email: 'alex@example.com',
      displayName: 'Alex',
      avatar: { kind: 'squircle', color: '#2bb3a3' },
      avatarRenderedAt: null,
    };
    const authService = {
      createUser: jest.fn().mockResolvedValue(created),
    };
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('sessionInfo', {
        sessionId: 'admin-session',
        user: { id: 'admin-1', email: 'admin@example.com', role: UserRole.ADMIN },
      });
      await next();
    });
    app.onError(handleError);
    app.route(
      '/auth',
      createAuthRoutes({
        rateLimitGuard: noRateLimit,
        authService,
        auditLogService: {},
        configurationService: { get: () => undefined },
        qrLoginService: {},
      } as never)
    );
    return { app, authService, created };
  };

  const createAccount = (app: Hono, body: unknown) =>
    app.request('/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('creates an account with a profile name and look', async () => {
    const { app, authService, created } = setupAdminApp();
    const response = await createAccount(app, {
      email: created.email,
      password: 'long-enough',
      role: UserRole.USER,
      displayName: 'Alex',
      avatar: created.avatar,
    });

    expect(response.status).toBe(201);
    expect(authService.createUser).toHaveBeenCalledWith(
      created.email,
      'long-enough',
      UserRole.USER,
      { displayName: 'Alex', avatar: created.avatar }
    );
    expect(await response.json()).toEqual({
      id: 'user-2',
      email: created.email,
      displayName: 'Alex',
      role: UserRole.USER,
      avatar: created.avatar,
      avatarVersion: null,
    });
  });

  it('answers 409 when the email is taken', async () => {
    const { app, authService } = setupAdminApp();
    authService.createUser.mockRejectedValueOnce(new UserAlreadyExistsError());
    const response = await createAccount(app, {
      email: 'alex@example.com',
      password: 'long-enough',
      role: UserRole.USER,
    });
    expect(response.status).toBe(409);
  });
});

describe('auth routes login hardening', () => {
  it('refuses logins to an account after 10 failures, even with the right password', async () => {
    const { app, authService } = setupTest();
    authService.validateUser.mockResolvedValue(null);
    for (let i = 0; i < 10; i++) expect((await login(app)).status).toBe(401);

    authService.validateUser.mockResolvedValue(user);
    const response = await login(app);
    expect(response.status).toBe(429);
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(authService.validateUser).toHaveBeenCalledTimes(10);
  });

  it('requires 8 characters for a new account password', async () => {
    const { app, authService } = setupTest();
    const response = await app.request('/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com', password: 'short', role: UserRole.USER }),
    });
    expect(response.status).toBe(400);
    expect(authService.createUser).not.toHaveBeenCalled();
  });
});
