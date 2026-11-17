import { zValidator } from '@hono/zod-validator';
import { isContractError } from '@miauflix/contract';
import type { CardImageFormat, CardImageSize } from '@miauflix/service-contracts';
import { Hono } from 'hono';
import { z } from 'zod';

import { HttpError } from '@errors/http.error';

import type { RouteDeps } from './common.types';

const FORMATS: Record<string, CardImageFormat> = { jpg: 'jpeg', webp: 'webp' };
const IMMUTABLE = 'public, max-age=31536000, immutable';
/** An unversioned (or outdated) URL: the drawing may change with the next artwork revision. */
const REVALIDATE = 'public, max-age=300';

const paramsSchema = z.object({
  mediaType: z.enum(['movie', 'tv']),
  mediaId: z.string().regex(/^\d{1,9}$/u),
  file: z.string().regex(/^(?:sm|md|lg)\.(?:jpg|webp)$/u),
});

/**
 * Card images: a title's backdrop with its logo (or its name) drawn in, so a Home card paints one
 * image. Served without authentication, like the provider artwork they are drawn from: the TV app
 * loads them as plain `<img>` sources, which cannot carry its bearer token. The catalog only draws
 * titles it already stores, never asking the provider for new ones.
 *
 * `GET /card/:mediaType/:mediaId/:size.:ext?rev=N`: `rev` (the media's `artworkRevision`) versions
 * the URL, so an image matching it is kept forever.
 */
export const createArtworkRoutes = ({
  rateLimitGuard,
  catalogClient,
}: Pick<RouteDeps, 'catalogClient' | 'rateLimitGuard'>) =>
  new Hono().get(
    '/card/:mediaType/:mediaId/:file',
    // A Home page asks for a few dozen at once
    rateLimitGuard(60),
    zValidator('param', paramsSchema),
    zValidator(
      'query',
      z.object({
        rev: z
          .string()
          .regex(/^\d{1,9}$/u)
          .optional(),
      })
    ),
    async c => {
      const { mediaType, mediaId, file } = c.req.valid('param');
      const [size, extension] = file.split('.') as [CardImageSize, string];
      let response: Response;
      try {
        response = await catalogClient.cardImage(
          mediaType,
          Number(mediaId),
          size,
          FORMATS[extension]
        );
      } catch (error) {
        if (isContractError(error, 'not_found')) throw new HttpError(404, 'Title not found');
        // A catalog without card images yet (older, or not configured): the card shows its layers
        if (
          isContractError(error, 'unsupported') ||
          isContractError(error, 'not_configured') ||
          isContractError(error, 'unavailable')
        )
          throw new HttpError(503, 'Card images are not available');
        if (error instanceof DOMException && error.name === 'TimeoutError')
          throw new HttpError(504, 'The card image took too long');
        throw error;
      }
      if (response.status === 404) throw new HttpError(404, 'Title not found');
      if (!response.ok) throw new HttpError(502, 'The card image could not be drawn');
      const { rev } = c.req.valid('query');
      const headers = new Headers(response.headers);
      // The catalog names a revision only for images that revision fully determines: a card drawing
      // its name (no logo) can change without one, so it is never kept forever
      headers.set(
        'Cache-Control',
        rev !== undefined && rev === headers.get('x-artwork-revision') ? IMMUTABLE : REVALIDATE
      );
      return new Response(response.body, { status: 200, headers });
    }
  );
