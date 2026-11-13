import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { InvalidTokenError } from '@errors/auth.errors';
import { HttpError } from '@errors/http.error';
import { authGuard } from '@middleware/auth.middleware';
import { toUserDto } from '@services/auth/user-dto.util';
import { InvalidAvatarImageError, MAX_AVATAR_IMAGE_BYTES } from '@services/profile/profile.service';

import type { UserDto } from './auth.types';
import type { RouteDeps } from './common.types';
import { updateProfileSchema } from './profile.schema';

/** Profile routes, mounted under `/api/auth`: each session edits its own profile. */
export const createProfileRoutes = ({
  rateLimitGuard,
  profileService,
}: Pick<RouteDeps, 'profileService' | 'rateLimitGuard'>) => {
  return new Hono()
    .patch(
      '/session/profile',
      rateLimitGuard(2),
      authGuard(),
      zValidator('json', updateProfileSchema),
      async c => {
        const { user } = c.get('sessionInfo');
        const updated = await profileService.updateProfile(user.id, c.req.valid('json'));
        if (!updated) throw new InvalidTokenError();
        return c.json(toUserDto(updated) satisfies UserDto);
      }
    )
    .put(
      '/session/avatar',
      rateLimitGuard(1),
      authGuard(),
      bodyLimit({
        maxSize: MAX_AVATAR_IMAGE_BYTES,
        onError: () => {
          throw new HttpError(413, 'Avatar image is too large');
        },
      }),
      async c => {
        if (c.req.header('content-type')?.split(';')[0].trim() !== 'image/png') {
          throw new HttpError(415, 'Avatar image must be a PNG');
        }
        const { user } = c.get('sessionInfo');
        try {
          const image = new Uint8Array(await c.req.arrayBuffer());
          const updated = await profileService.saveAvatarImage(user.id, image);
          if (!updated) throw new InvalidTokenError();
          return c.json(toUserDto(updated) satisfies UserDto);
        } catch (error) {
          if (error instanceof InvalidAvatarImageError) {
            throw new HttpError(400, error.message);
          }
          throw error;
        }
      }
    )
    .get(
      '/avatars/:userId',
      rateLimitGuard(20),
      authGuard(),
      zValidator('param', z.object({ userId: z.uuid() })),
      // The picture's `avatarVersion`: a new picture gets a new URL, so one URL never changes.
      zValidator(
        'query',
        z.object({
          v: z
            .string()
            .regex(/^\d{1,16}$/)
            .optional(),
        })
      ),
      async c => {
        const image = await profileService.getAvatarImage(c.req.valid('param').userId);
        if (!image) {
          throw new HttpError(404, 'Avatar not found');
        }
        return c.body(new Uint8Array(image), 200, {
          'Content-Type': 'image/png',
          // Only a versioned URL can be kept forever; without one the browser must revalidate,
          // or it would keep showing the picture from before the last save.
          'Cache-Control': c.req.valid('query').v
            ? 'private, max-age=31536000, immutable'
            : 'private, no-cache',
        });
      }
    );
};
