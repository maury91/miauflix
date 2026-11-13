import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { HttpError } from '@errors/http.error';
import { authGuard } from '@middleware/auth.middleware';
import { SubtitleAccessError } from '@services/subtitles/subtitles.service';

import type { RouteDeps } from './common.types';
import type { SubtitleFontListResponse } from './subtitles.types';
import { subtitleSearchRequestSchema } from './subtitles.types';

export const createSubtitleRoutes = ({
  rateLimitGuard,
  subtitlesService,
}: Pick<RouteDeps, 'rateLimitGuard' | 'subtitlesService'>) => {
  return new Hono()
    .post(
      '/search',
      rateLimitGuard(0.5),
      authGuard(),
      zValidator('json', subtitleSearchRequestSchema),
      async c => {
        const session = c.get('sessionInfo');
        const { streamingKey, language, hearingImpaired, refresh, localOnly } = c.req.valid('json');
        try {
          return c.json(
            await subtitlesService.search(
              streamingKey,
              session.user.id,
              language,
              hearingImpaired,
              refresh,
              localOnly
            )
          );
        } catch (error) {
          if (error instanceof SubtitleAccessError) {
            throw new HttpError(403, error.message);
          }
          throw new HttpError(502, 'Subtitle search is unavailable', { cause: error });
        }
      }
    )
    .get('/tracks/:candidateId/fonts', rateLimitGuard(1), async c => {
      const { candidateId } = c.req.param();
      const streamingKey = c.req.query('streamingKey');
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(candidateId) || !streamingKey)
        throw new HttpError(404, 'Fonts are unavailable');
      try {
        const fonts: SubtitleFontListResponse = {
          fonts: await subtitlesService.getFonts(candidateId, streamingKey),
        };
        return c.json(fonts, 200, {
          'cache-control': 'private, no-store',
          'referrer-policy': 'no-referrer',
        });
      } catch (error) {
        if (error instanceof SubtitleAccessError) throw new HttpError(404, 'Fonts are unavailable');
        throw new HttpError(502, 'Fonts could not be loaded', { cause: error });
      }
    })
    .get('/tracks/:candidateId/fonts/:fontId', rateLimitGuard(10), async c => {
      const { candidateId, fontId } = c.req.param();
      const streamingKey = c.req.query('streamingKey');
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(candidateId) || !/^\d{1,5}$/.test(fontId) || !streamingKey)
        return c.text('Font is unavailable', 404);
      try {
        const font = await subtitlesService.getFontFile(candidateId, streamingKey, Number(fontId));
        if (!font) return c.text('Font is unavailable', 404);
        return c.body(new Uint8Array(font.data), 200, {
          'content-type': font.format === 'otf' ? 'font/otf' : 'font/ttf',
          'cache-control': 'private, no-store',
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
        });
      } catch (error) {
        if (error instanceof SubtitleAccessError) return c.text('Font is unavailable', 404);
        return c.text('Font could not be loaded', 502);
      }
    })
    .get('/tracks/:candidateId/font', rateLimitGuard(1), async c => {
      const { candidateId } = c.req.param();
      const streamingKey = c.req.query('streamingKey');
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(candidateId) || !streamingKey)
        return c.text('Font is unavailable', 404);
      try {
        const font = await subtitlesService.getFont(candidateId, streamingKey);
        if (!font) return c.text('Font is unavailable', 404);
        return c.body(new Uint8Array(font.data), 200, {
          'content-type': font.format === 'otf' ? 'font/otf' : 'font/ttf',
          'cache-control': 'private, no-store',
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
        });
      } catch (error) {
        if (error instanceof SubtitleAccessError) return c.text('Font is unavailable', 404);
        return c.text('Font could not be loaded', 502);
      }
    })
    .get('/tracks/:candidateId', rateLimitGuard(5), async c => {
      const { candidateId } = c.req.param();
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(candidateId)) {
        return c.text('Subtitle is unavailable', 404);
      }
      const streamingKey = c.req.query('streamingKey');
      if (!streamingKey) return c.text('Subtitle is unavailable', 404);
      const start = c.req.query('start') ?? '0';
      if (!/^\d{1,6}$/.test(start) || Number(start) > 7 * 24 * 3600)
        return c.text('Invalid subtitle position', 400);
      const format = c.req.query('format') ?? 'vtt';
      if (format !== 'vtt' && format !== 'ass') return c.text('Invalid subtitle format', 400);
      try {
        const body = await subtitlesService.getTrack(
          candidateId,
          streamingKey,
          Number(start),
          format
        );
        return c.body(body, 200, {
          'content-type':
            format === 'ass' ? 'text/x-ssa; charset=utf-8' : 'text/vtt; charset=utf-8',
          'cache-control': 'private, no-store',
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
        });
      } catch (error) {
        if (error instanceof SubtitleAccessError) return c.text('Subtitle is unavailable', 404);
        return c.text('Subtitle could not be loaded', 502);
      }
    });
};
