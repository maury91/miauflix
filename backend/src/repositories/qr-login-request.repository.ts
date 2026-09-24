import { LessThan, MoreThan, type Repository } from 'typeorm';

import type { Database } from '@database/database';
import { QrLoginRequest } from '@entities/qr-login-request.entity';

export class QrLoginRequestRepository {
  private readonly repository: Repository<QrLoginRequest>;
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
    this.repository = database.getRepository(QrLoginRequest);
  }

  create(values: Partial<QrLoginRequest>): Promise<QrLoginRequest> {
    return this.repository.save(this.repository.create(values));
  }

  findByApprovalHash(approvalTokenHash: string): Promise<QrLoginRequest | null> {
    return this.repository.findOne({ where: { approvalTokenHash } });
  }

  findByClaimHash(claimTokenHash: string): Promise<QrLoginRequest | null> {
    return this.repository.findOne({ where: { claimTokenHash } });
  }

  async approve(id: string, userId: string): Promise<boolean> {
    return this.database.transaction(async manager => {
      const repository = manager.getRepository(QrLoginRequest);
      const now = new Date();
      const result = await repository.update(
        { id, state: 'pending', expiresAt: MoreThan(now) },
        { state: 'approved', approvedUserId: userId, approvedAt: now }
      );
      return !!result.affected;
    });
  }

  async reject(id: string): Promise<boolean> {
    const result = await this.repository.update({ id, state: 'pending' }, { state: 'rejected' });
    return !!result.affected;
  }

  async expire(id: string): Promise<boolean> {
    const result = await this.repository.update({ id, state: 'pending' }, { state: 'expired' });
    return !!result.affected;
  }

  async beginClaim(id: string, lease: string): Promise<QrLoginRequest | null> {
    return this.database.transaction(async manager => {
      const repository = manager.getRepository(QrLoginRequest);
      const now = new Date();
      const result = await repository.update(
        { id, state: 'approved', expiresAt: MoreThan(now) },
        { state: 'claiming', claimedAt: now, claimLease: lease }
      );
      if (!result.affected) return null;
      return repository.findOne({ where: { id } });
    });
  }

  async completeClaim(id: string, lease: string): Promise<boolean> {
    return this.database.transaction(async manager => {
      const repository = manager.getRepository(QrLoginRequest);
      const now = new Date();
      const result = await repository.update(
        { id, state: 'claiming', claimLease: lease, expiresAt: MoreThan(now) },
        { state: 'claimed', claimLease: null }
      );
      return !!result.affected;
    });
  }

  async releaseClaim(id: string, lease: string): Promise<boolean> {
    const result = await this.repository.update(
      { id, state: 'claiming', claimLease: lease },
      { state: 'approved', claimedAt: null, claimLease: null }
    );
    return !!result.affected;
  }

  async expireAndDelete(before: Date): Promise<void> {
    await this.repository.delete({ expiresAt: LessThan(before) });
  }
}
