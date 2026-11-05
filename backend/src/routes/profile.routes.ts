import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { InvalidTokenError } from '@errors/auth.errors';
import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import { toUserDto } from '@services/auth/user-dto.util';
import { InvalidAvatarImageError, MAX_AVATAR_IMAGE_BYTES } from '@services/profile/profile.service';

import type { UserDto } from './auth.types';
import type { Deps, ErrorResponse } from './common.types';
import { updateProfileSchema } from './profile.schema';

/** Profile routes, mounted under `/api/auth`: each session edits its own profile. */
export const createProfileRoutes = ({
  auditLogService,
  configurationService,
  profileService,
}: Pick<Deps, 'auditLogService' | 'configurationService' | 'profileService'>) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService, configurationService);

  return new Hono()
    .patch(
      '/session/profile',
      rateLimitGuard(2),
      authGuard(),
      zValidator('json', updateProfileSchema),
      async context => {
        const { user } = context.get('sessionInfo');
        const updated = await profileService.updateProfile(user.id, context.req.valid('json'));
        if (!updated) throw new InvalidTokenError();
        return context.json(toUserDto(updated) satisfies UserDto);
      }
    )
    .put(
      '/session/avatar',
      rateLimitGuard(1),
      authGuard(),
      bodyLimit({
        maxSize: MAX_AVATAR_IMAGE_BYTES,
        onError: context =>
          context.json({ error: 'Avatar image is too large' } satisfies ErrorResponse, 413),
      }),
      async context => {
        if (context.req.header('content-type')?.split(';')[0].trim() !== 'image/png') {
          return context.json({ error: 'Avatar image must be a PNG' } satisfies ErrorResponse, 415);
        }
        const { user } = context.get('sessionInfo');
        try {
          const image = new Uint8Array(await context.req.arrayBuffer());
          const updated = await profileService.saveAvatarImage(user.id, image);
          if (!updated) throw new InvalidTokenError();
          return context.json(toUserDto(updated) satisfies UserDto);
        } catch (error) {
          if (error instanceof InvalidAvatarImageError) {
            return context.json({ error: error.message } satisfies ErrorResponse, 400);
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
      async context => {
        const image = await profileService.getAvatarImage(context.req.valid('param').userId);
        if (!image) {
          return context.json({ error: 'Avatar not found' } satisfies ErrorResponse, 404);
        }
        return context.body(new Uint8Array(image), 200, {
          'Content-Type': 'image/png',
          // Only a versioned URL can be kept forever; without one the browser must revalidate,
          // or it would keep showing the picture from before the last save.
          'Cache-Control': context.req.valid('query').v
            ? 'private, max-age=31536000, immutable'
            : 'private, no-cache',
        });
      }
    );
};
