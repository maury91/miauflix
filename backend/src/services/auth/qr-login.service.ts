import { createHash, randomBytes, randomUUID } from 'crypto';
import type { Context } from 'hono';

import type { Database } from '@database/database';
import type { QrLoginRequest } from '@entities/qr-login-request.entity';
import type { ConfigService } from '@mytypes/configuration';
import type { QrLoginRequestRepository } from '@repositories/qr-login-request.repository';
import { getRealClientIp } from '@utils/proxy.util';

const TTL_MS = 5 * 60 * 1000;

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

const token = (): string => randomBytes(32).toString('base64url');

export class QrLoginService {
  private readonly repository: QrLoginRequestRepository;

  constructor(
    private readonly db: Database,
    private readonly config?: Pick<ConfigService, 'get'>
  ) {
    this.repository = db.getQrLoginRequestRepository();
  }

  async create(context: Context): Promise<{
    requestId: string;
    claimToken: string;
    approvalPath: string;
    expiresAt: string;
    pollInterval: number;
  }> {
    const approvalToken = token();
    const claimToken = token();
    const expiresAt = new Date(Date.now() + TTL_MS);
    const request = await this.repository.create({
      approvalTokenHash: hash(approvalToken),
      claimTokenHash: hash(claimToken),
      state: 'pending',
      approvedUserId: null,
      userAgent: context.req.header('user-agent')?.slice(0, 500) ?? null,
      ipAddress: this.clientIp(context),
      expiresAt,
      approvedAt: null,
      claimedAt: null,
      claimLease: null,
    });
    return {
      requestId: request.id,
      claimToken,
      approvalPath: `/auth/qr/${approvalToken}`,
      expiresAt: expiresAt.toISOString(),
      pollInterval: 2,
    };
  }

  /** X-Forwarded-For only counts when the reverse proxy vouched for it with its secret. */
  private clientIp(context: Context): string | null {
    try {
      return getRealClientIp(context, this.config?.get('REVERSE_PROXY_SECRET') ?? '') || null;
    } catch {
      // Not served by Bun.serve (tests): no connection to read
      return null;
    }
  }

  async getApproval(approvalToken: string): Promise<QrLoginRequest | null> {
    const request = await this.repository.findByApprovalHash(hash(approvalToken));
    if (!request) return null;
    if (request.expiresAt <= new Date() && request.state === 'pending') {
      await this.repository.expire(request.id);
      request.state = 'expired';
    }
    return request;
  }

  async approve(approvalToken: string, userId: string): Promise<QrLoginRequest | null> {
    const request = await this.getApproval(approvalToken);
    if (!request || request.state !== 'pending') return null;
    if (!(await this.repository.approve(request.id, userId))) return null;
    return this.getApproval(approvalToken);
  }

  async reject(approvalToken: string): Promise<boolean> {
    const request = await this.getApproval(approvalToken);
    return !!request && (await this.repository.reject(request.id));
  }

  async beginClaim(
    claimToken: string,
    expectedId?: string
  ): Promise<{ request: QrLoginRequest; lease: string } | null> {
    const request = await this.repository.findByClaimHash(hash(claimToken));
    if (expectedId && request?.id !== expectedId) return null;
    if (!request || request.expiresAt <= new Date() || request.state !== 'approved') return null;
    const lease = randomUUID();
    const claimed = await this.repository.beginClaim(request.id, lease);
    return claimed ? { request: claimed, lease } : null;
  }

  completeClaim(id: string, lease: string): Promise<boolean> {
    return this.repository.completeClaim(id, lease);
  }

  releaseClaim(id: string, lease: string): Promise<boolean> {
    return this.repository.releaseClaim(id, lease);
  }

  async cleanup(): Promise<number> {
    return this.repository.expireAndDelete(new Date(Date.now() - TTL_MS));
  }
}
