import { zValidator } from '@hono/zod-validator';
import { Quality } from '@miauflix/source-metadata-extractor';
import { Hono } from 'hono';
import { z } from 'zod';

import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import type { AuthService } from '@services/auth/auth.service';
import type { AuditLogService } from '@services/security/audit-log.service';
import type { StreamService } from '@services/stream/stream.service';

import type { StreamResponse } from './stream.types';

export const createStreamRoutes = (
  authService: AuthService,
  streamService: StreamService,
  auditLogService: AuditLogService
) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService);

  return new Hono().get(
    '/:token',
    rateLimitGuard(60), // 60 requests per minute for streaming (allows seeking, pausing)
    zValidator(
      'param',
      z.object({
        token: z.string().min(10, 'Invalid key format'),
      })
    ),
    zValidator(
      'query',
      z.object({
        quality: z
          .enum(['auto', ...Object.values(Quality)] as const, {
            errorMap: () => ({
              message: `Quality must be one of: auto, ${Object.values(Quality).join(', ')}`,
            }),
          })
          .optional(),
        hevc: z
          .string()
          .optional()
          .transform(val => val === 'true'),
      })
    ),
    async context => {
      try {
        const { token } = context.req.valid('param');
        const { quality = 'auto', hevc = true } = context.req.valid('query');

        // Verify streaming key (includes timing attack protection)
        const keyData = await authService.verifyStreamingKey(token);
        const { movieId } = keyData;

        // Get the best source based on quality and codec preferences
        const source = await streamService.getBestSourceForStreaming(movieId, quality, hevc);

        if (!source) {
          const codecMsg = hevc === false ? ' (H.265 excluded)' : '';
          return context.json(
            {
              error: `No ${quality === 'auto' ? 'suitable' : quality} quality source available${codecMsg}`,
            },
            404
          );
        }

        const response: StreamResponse = {
          status: 'not implemented',
          source: {
            id: source.id,
            quality: source.quality,
            size: source.size,
            videoCodec: source.videoCodec,
          },
        };
        return context.json(response, 501);
      } catch (error: unknown) {
        console.error('Failed to stream content:', error);

        if (error && typeof error === 'object' && 'message' in error) {
          const errorMessage = error.message as string;
          if (errorMessage.includes('Invalid token')) {
            return context.json({ error: 'Invalid or expired streaming key' }, 401);
          }
        }

        return context.json({ error: 'Internal server error' }, 500);
      }
    }
  );
};
