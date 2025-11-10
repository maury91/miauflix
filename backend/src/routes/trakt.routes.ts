import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { AuditEventType } from '@entities/audit-log.entity';
import { UserRole } from '@entities/user.entity';
import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import { setCookies } from '@utils/setCookies.util';

import type { Deps, ErrorResponse } from './common.types';
import type {
  DeviceAuthCheckResponse,
  DeviceAuthResponse,
  TraktAdminAssociateResponse,
  TraktAssociationResponse,
} from './trakt.types';

export const createTraktRoutes = ({ traktService, auditLogService, authService }: Deps) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(auditLogService);

  // Initiate Trakt device authentication (authenticated users only)
  return (
    new Hono()
      .post(
        '/auth/device',
        rateLimitGuard(2), // 2 attempts per second
        authGuard(),
        async context => {
          try {
            const deviceAuth = await traktService.initiateDeviceAuth();

            return context.json({
              codeUrl: deviceAuth.codeUrl,
              userCode: deviceAuth.userCode,
              deviceCode: deviceAuth.deviceCode,
              expiresIn: deviceAuth.expiresIn,
              interval: deviceAuth.interval,
              expiresAt: deviceAuth.expiresAt,
            } satisfies DeviceAuthResponse);
          } catch (error) {
            console.error('Trakt device auth initiation failed:', error);
            return context.json(
              {
                error: 'Failed to initiate Trakt authentication',
              } satisfies ErrorResponse,
              500
            );
          }
        }
      )
      // Check device authentication status and complete login
      .post(
        '/auth/device/check',
        rateLimitGuard(1), // 1 attempt per second
        authGuard(),
        zValidator(
          'json',
          z.object({
            deviceCode: z.string().min(1),
          })
        ),
        async context => {
          const { deviceCode } = context.req.valid('json');
          const { user } = context.get('sessionInfo');

          try {
            const result = await traktService.checkDeviceAuth(deviceCode, user.id);

            if (result) {
              await auditLogService.logSecurityEvent({
                eventType: AuditEventType.API_ACCESS,
                description: `User linked Trakt account: ${result.profile.username}`,
                userEmail: user.email,
                context,
                metadata: {
                  traktSlug: result.profile.ids.slug,
                  traktUsername: result.profile.username,
                },
              });

              const authResult = await authService.generateTokens(result.user, context);

              setCookies(context, authService.getCookies(authResult));

              return context.json({
                success: true,
                session: authResult.session,
                user: authResult.user,
              } satisfies DeviceAuthCheckResponse);
            }

            return context.json({
              success: false,
              pending: true,
            } satisfies DeviceAuthCheckResponse);
          } catch (error) {
            // ToDo: handle errors correctly ( have custom errors that can be checked with instanceof )
            console.error('Trakt device auth check failed:', error);
            return context.json(
              {
                error: 'Failed to check Trakt authentication status',
              } satisfies ErrorResponse,
              401
            );
          }
        }
      )
      // Get user's current Trakt association
      .get(
        '/association',
        rateLimitGuard(5), // 5 attempts per second
        authGuard(),
        async context => {
          const { user } = context.get('sessionInfo');

          try {
            const association = await traktService.getUserTraktAssociation(user.id);

            const response: TraktAssociationResponse = {
              associated: !!association,
              traktUsername: association?.traktUsername || null,
              traktSlug: association?.traktSlug || null,
            };
            return context.json(response);
          } catch (error) {
            console.error('Failed to get Trakt association:', error);
            return context.json(
              { error: 'Failed to get Trakt association' } satisfies ErrorResponse,
              500
            );
          }
        }
      )
      // Admin endpoint: Associate Trakt slug with a user
      .post(
        '/admin/associate',
        rateLimitGuard(1), // 1 attempt per second
        authGuard(UserRole.ADMIN),
        zValidator(
          'json',
          z.object({
            traktSlug: z.string().min(1),
            userEmail: z.string().email(),
          })
        ),
        async context => {
          const { traktSlug, userEmail } = context.req.valid('json');
          const { user } = context.get('sessionInfo');

          try {
            const association = await traktService.associateTraktUser(traktSlug, userEmail);

            await auditLogService.logSecurityEvent({
              eventType: AuditEventType.USER_UPDATE,
              description: `Admin associated Trakt account ${traktSlug} with user ${userEmail}`,
              userEmail: user.email,
              context,
              metadata: {
                traktSlug,
                targetUserEmail: userEmail,
                associationId: association.id,
              },
            });

            const response: TraktAdminAssociateResponse = {
              success: true,
              association: {
                id: association.id,
                traktSlug: association.traktSlug,
                userEmail: association.user?.email || null,
              },
            };
            return context.json(response);
          } catch (error) {
            console.error('Failed to associate Trakt user:', error);
            return context.json(
              { error: 'Failed to associate Trakt user' } satisfies ErrorResponse,
              500
            );
          }
        }
      )
  );
};
