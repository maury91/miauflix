import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import { SubtitleAccessError } from '@services/subtitles/subtitles.service';

import type { Deps } from './common.types';
import type { SubtitleFontListResponse } from './subtitles.types';
import { subtitleSearchRequestSchema } from './subtitles.types';

export const createSubtitleRoutes = ({
  auditLogService,
  configurationService,
  subtitlesService,
}: Pick<Deps, 'auditLogService' | 'configurationService' | 'subtitlesService'>) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService, configurationService);

  return new Hono()
    .post(
      '/search',
      rateLimitGuard(0.5),
      authGuard(),
      zValidator('json', subtitleSearchRequestSchema),
      async context => {
        const session = context.get('sessionInfo');
        const { streamingKey, language, hearingImpaired, refresh, localOnly } =
          context.req.valid('json');
        try {
          return context.json(
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
            return context.json({ error: error.message }, 403);
          }
          return context.json({ error: 'Subtitle search is unavailable' }, 502);
        }
      }
    )
    .get('/tracks/:candidateId/fonts', rateLimitGuard(1), async context => {
      const { candidateId } = context.req.param();
      const streamingKey = context.req.query('streamingKey');
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(candidateId) || !streamingKey)
        return context.json({ error: 'Fonts are unavailable' }, 404);
      try {
        const fonts: SubtitleFontListResponse = {
          fonts: await subtitlesService.getFonts(candidateId, streamingKey),
        };
        return context.json(fonts, 200, {
          'cache-control': 'private, no-store',
          'referrer-policy': 'no-referrer',
        });
      } catch (error) {
        if (error instanceof SubtitleAccessError)
          return context.json({ error: 'Fonts are unavailable' }, 404);
        return context.json({ error: 'Fonts could not be loaded' }, 502);
      }
    })
    .get('/tracks/:candidateId/fonts/:fontId', rateLimitGuard(10), async context => {
      const { candidateId, fontId } = context.req.param();
      const streamingKey = context.req.query('streamingKey');
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(candidateId) || !/^\d{1,5}$/.test(fontId) || !streamingKey)
        return context.text('Font is unavailable', 404);
      try {
        const font = await subtitlesService.getFontFile(candidateId, streamingKey, Number(fontId));
        if (!font) return context.text('Font is unavailable', 404);
        return context.body(new Uint8Array(font.data), 200, {
          'content-type': font.format === 'otf' ? 'font/otf' : 'font/ttf',
          'cache-control': 'private, no-store',
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
        });
      } catch (error) {
        if (error instanceof SubtitleAccessError) return context.text('Font is unavailable', 404);
        return context.text('Font could not be loaded', 502);
      }
    })
    .get('/tracks/:candidateId/font', rateLimitGuard(1), async context => {
      const { candidateId } = context.req.param();
      const streamingKey = context.req.query('streamingKey');
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(candidateId) || !streamingKey)
        return context.text('Font is unavailable', 404);
      try {
        const font = await subtitlesService.getFont(candidateId, streamingKey);
        if (!font) return context.text('Font is unavailable', 404);
        return context.body(new Uint8Array(font.data), 200, {
          'content-type': font.format === 'otf' ? 'font/otf' : 'font/ttf',
          'cache-control': 'private, no-store',
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
        });
      } catch (error) {
        if (error instanceof SubtitleAccessError) return context.text('Font is unavailable', 404);
        return context.text('Font could not be loaded', 502);
      }
    })
    .get('/tracks/:candidateId', rateLimitGuard(5), async context => {
      const { candidateId } = context.req.param();
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(candidateId)) {
        return context.text('Subtitle is unavailable', 404);
      }
      const streamingKey = context.req.query('streamingKey');
      if (!streamingKey) return context.text('Subtitle is unavailable', 404);
      const start = context.req.query('start') ?? '0';
      if (!/^\d{1,6}$/.test(start) || Number(start) > 7 * 24 * 3600)
        return context.text('Invalid subtitle position', 400);
      const format = context.req.query('format') ?? 'vtt';
      if (format !== 'vtt' && format !== 'ass') return context.text('Invalid subtitle format', 400);
      try {
        const body = await subtitlesService.getTrack(
          candidateId,
          streamingKey,
          Number(start),
          format
        );
        return context.body(body, 200, {
          'content-type':
            format === 'ass' ? 'text/x-ssa; charset=utf-8' : 'text/vtt; charset=utf-8',
          'cache-control': 'private, no-store',
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
        });
      } catch (error) {
        if (error instanceof SubtitleAccessError)
          return context.text('Subtitle is unavailable', 404);
        return context.text('Subtitle could not be loaded', 502);
      }
    });
};
