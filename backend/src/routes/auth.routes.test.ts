jest.mock('@middleware/rate-limit.middleware', () => ({
  createRateLimitMiddlewareFactory:
    () => () => async (_context: unknown, next: () => Promise<void>) =>
      next(),
}));

import { Hono } from 'hono';

import { UserRole } from '@entities/user.entity';
import { InvalidTokenError } from '@errors/auth.errors';

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
    generateTokens: jest.fn().mockResolvedValue(authResult),
    refreshTokens: jest.fn().mockResolvedValue(authResult),
    logout: jest.fn().mockResolvedValue(user),
    clearCookies: jest.fn(),
    getCookieConfig: (session: string) => ({ name: `__rt_${session}` }),
    getCookies: jest.fn(() => [
      { name: '__at_session-1', value: 'access-token', path: '/', httpOnly: true },
      { name: '__rt_session-1', value: 'refresh-token', path: '/api/auth/', httpOnly: true },
    ]),
  };
  const auditLogService = {
    logLoginAttempt: jest.fn(),
    logTokenRefresh: jest.fn(),
    logTokenInvalidation: jest.fn(),
  };
  const app = new Hono();
  app.onError((error, c) => c.json({ error: error.message }, 401));
  app.route(
    '/auth',
    createAuthRoutes({
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

  it('rejects a refresh without a refresh token', async () => {
    const { app } = setupTest();
    const response = await app.request('/auth/refresh/session-1', { method: 'POST' });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: new InvalidTokenError().message });
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
