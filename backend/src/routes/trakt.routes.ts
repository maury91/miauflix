import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { AuditEventType } from '@entities/audit-log.entity';
import { UserRole } from '@entities/user.entity';
import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import type { AuditLogService } from '@services/security/audit-log.service';
import type { TraktService } from '@services/trakt/trakt.service';

import type {
  DeviceAuthCheckResponse,
  DeviceAuthResponse,
  TraktAdminAssociateResponse,
  TraktAssociationResponse,
} from './trakt.types';

export const createTraktRoutes = (traktService: TraktService, auditLogService: AuditLogService) => {
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

            const response: DeviceAuthResponse = {
              success: true,
              codeUrl: deviceAuth.codeUrl,
              userCode: deviceAuth.userCode,
              deviceCode: deviceAuth.deviceCode,
              expiresIn: deviceAuth.expiresIn,
              interval: deviceAuth.interval,
            };
            return context.json(response);
          } catch (error) {
            console.error('Trakt device auth initiation failed:', error);
            return context.json(
              { success: false, error: 'Failed to initiate Trakt authentication' },
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
          const authUser = context.get('user')!;

          try {
            const result = await traktService.checkDeviceAuth(deviceCode, authUser.id);

            if (result.success) {
              await auditLogService.logSecurityEvent({
                eventType: AuditEventType.API_ACCESS,
                description: `User linked Trakt account: ${result.traktUsername}`,
                userEmail: authUser.email,
                context,
                metadata: {
                  traktSlug: result.traktSlug,
                  traktUsername: result.traktUsername,
                },
              });
            }

            const response: DeviceAuthCheckResponse = result;
            return context.json(response);
          } catch (error) {
            console.error('Trakt device auth check failed:', error);
            return context.json(
              { success: false, error: 'Failed to check Trakt authentication status' },
              500
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
          const authUser = context.get('user')!;

          try {
            const association = await traktService.getUserTraktAssociation(authUser.id);

            const response: TraktAssociationResponse = {
              associated: !!association,
              traktUsername: association?.traktUsername || null,
              traktSlug: association?.traktSlug || null,
            };
            return context.json(response);
          } catch (error) {
            console.error('Failed to get Trakt association:', error);
            return context.json({ error: 'Failed to get Trakt association' }, 500);
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
          const adminUser = context.get('user')!;

          try {
            const association = await traktService.associateTraktUser(traktSlug, userEmail);

            await auditLogService.logSecurityEvent({
              eventType: AuditEventType.USER_UPDATE,
              description: `Admin associated Trakt account ${traktSlug} with user ${userEmail}`,
              userEmail: adminUser.email,
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
            return context.json({ error: 'Failed to associate Trakt user' }, 500);
          }
        }
      )
  );
};
