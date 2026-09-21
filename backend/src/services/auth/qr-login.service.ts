import { createHash, randomBytes, randomUUID } from 'crypto';
import type { Context } from 'hono';

import type { Database } from '@database/database';
import type { QrLoginRequest } from '@entities/qr-login-request.entity';
import type { QrLoginRequestRepository } from '@repositories/qr-login-request.repository';

const TTL_MS = 5 * 60 * 1000;

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

const token = (): string => randomBytes(32).toString('base64url');

export class QrLoginService {
  private readonly repository: QrLoginRequestRepository;

  constructor(private readonly db: Database) {
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
      ipAddress: context.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
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

  async cleanup(): Promise<void> {
    await this.repository.expireAndDelete(new Date(Date.now() - TTL_MS));
  }
}
