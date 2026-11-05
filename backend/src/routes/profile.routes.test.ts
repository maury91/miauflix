jest.mock('@middleware/rate-limit.middleware', () => ({
  createRateLimitMiddlewareFactory:
    () => () => async (_context: unknown, next: () => Promise<void>) =>
      next(),
}));

import { Hono } from 'hono';

import { UserRole } from '@entities/user.entity';
import { AuthError } from '@errors/auth.errors';
import type { ProfileService } from '@services/profile/profile.service';
import { InvalidAvatarImageError, MAX_AVATAR_IMAGE_BYTES } from '@services/profile/profile.service';

import { createProfileRoutes } from './profile.routes';

const USER_ID = '7f1c1a8e-6f3b-4c55-9a41-2b7c6c3f9d10';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

const storedUser = {
  id: USER_ID,
  email: 'user@example.com',
  displayName: 'Sam',
  role: UserRole.USER,
  avatar: { kind: 'circle', color: '#f47c9a' },
  avatarRenderedAt: new Date('2026-11-01T10:00:00Z'),
};

const setupTest = (authenticated = true) => {
  const profileService = {
    updateProfile: jest.fn().mockResolvedValue(storedUser),
    saveAvatarImage: jest.fn().mockResolvedValue(storedUser),
    getAvatarImage: jest.fn().mockResolvedValue(Buffer.from(PNG)),
  };
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (authenticated)
      c.set('sessionInfo', {
        sessionId: 'session-1',
        user: { id: USER_ID, email: storedUser.email, role: UserRole.USER },
      });
    await next();
  });
  app.onError((error, c) =>
    c.json({ error: error.message }, error instanceof AuthError ? 401 : 500)
  );
  app.route(
    '/auth',
    createProfileRoutes({
      auditLogService: {},
      configurationService: { get: () => undefined },
      profileService: profileService as unknown as ProfileService,
    } as never)
  );
  return { app, profileService };
};

const patchProfile = (app: Hono, body: unknown) =>
  app.request('/auth/session/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('profile routes', () => {
  it('updates the name and look of the signed-in profile and returns its user', async () => {
    const { app, profileService } = setupTest();
    const avatar = { kind: 'pill', color: '#a05cf0', fabric: 'shaggy', cheeks: true, eyeSize: 1.2 };

    const response = await patchProfile(app, { displayName: '  Maurizio ', avatar });

    expect(response.status).toBe(200);
    expect(profileService.updateProfile).toHaveBeenCalledWith(USER_ID, {
      displayName: 'Maurizio',
      avatar,
    });
    expect(await response.json()).toEqual({
      id: USER_ID,
      email: storedUser.email,
      displayName: 'Sam',
      role: UserRole.USER,
      avatar: storedUser.avatar,
      avatarVersion: storedUser.avatarRenderedAt.getTime(),
    });
  });

  it.each([
    ['an empty name', { displayName: '   ' }],
    ['a long name', { displayName: 'x'.repeat(41) }],
    ['an option name with symbols', { avatar: { 'kind<': 'pill' } }],
    ['an option value with markup', { avatar: { kind: '<script>' } }],
    ['a nested option', { avatar: { kind: { nested: true } } }],
    ['a removed look', { avatar: null }],
    [
      'too many options',
      {
        avatar: Object.fromEntries(
          Array.from({ length: 41 }, (_, i) => [
            `option${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`,
            1,
          ])
        ),
      },
    ],
  ])('rejects %s', async (_label, body) => {
    const { app, profileService } = setupTest();
    const response = await patchProfile(app, body);
    expect(response.status).toBe(400);
    expect(profileService.updateProfile).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    const { app } = setupTest(false);
    expect((await patchProfile(app, { displayName: 'Sam' })).status).toBe(401);
  });

  it('stores an uploaded PNG for the signed-in profile', async () => {
    const { app, profileService } = setupTest();
    const response = await app.request('/auth/session/avatar', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: PNG,
    });
    expect(response.status).toBe(200);
    expect(profileService.saveAvatarImage).toHaveBeenCalledWith(USER_ID, PNG);
  });

  it('rejects avatar uploads that are not PNG', async () => {
    const { app, profileService } = setupTest();
    const wrongType = await app.request('/auth/session/avatar', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: PNG,
    });
    expect(wrongType.status).toBe(415);

    profileService.saveAvatarImage.mockRejectedValueOnce(
      new InvalidAvatarImageError('Avatar image must be a PNG')
    );
    const wrongBytes = await app.request('/auth/session/avatar', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: 'not a png',
    });
    expect(wrongBytes.status).toBe(400);
  });

  it('rejects avatar uploads over the size limit', async () => {
    const { app, profileService } = setupTest();
    const response = await app.request('/auth/session/avatar', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: new Uint8Array(MAX_AVATAR_IMAGE_BYTES + 1),
    });
    expect(response.status).toBe(413);
    expect(profileService.saveAvatarImage).not.toHaveBeenCalled();
  });

  it('serves a profile avatar image', async () => {
    const { app, profileService } = setupTest();
    const response = await app.request(`/auth/avatars/${USER_ID}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
    expect(profileService.getAvatarImage).toHaveBeenCalledWith(USER_ID);
  });

  it('caches a picture for good only at its versioned URL', async () => {
    const { app } = setupTest();
    const versioned = await app.request(`/auth/avatars/${USER_ID}?v=1700000000000`);
    expect(versioned.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
    // Without a version the URL outlives the picture, so it must be revalidated.
    const unversioned = await app.request(`/auth/avatars/${USER_ID}`);
    expect(unversioned.headers.get('Cache-Control')).toBe('private, no-cache');
    expect((await app.request(`/auth/avatars/${USER_ID}?v=latest`)).status).toBe(400);
  });

  it('returns 404 for a profile without an image and 400 for an id that is not a uuid', async () => {
    const { app, profileService } = setupTest();
    profileService.getAvatarImage.mockResolvedValueOnce(null);
    expect((await app.request(`/auth/avatars/${USER_ID}`)).status).toBe(404);
    expect((await app.request('/auth/avatars/..%2Fconfig')).status).toBe(400);
  });
});
