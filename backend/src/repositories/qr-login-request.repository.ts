import { type DataSource, LessThan, MoreThan, type Repository } from 'typeorm';

import { QrLoginRequest } from '@entities/qr-login-request.entity';

export class QrLoginRequestRepository {
  private readonly repository: Repository<QrLoginRequest>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(QrLoginRequest);
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
    const result = await this.repository.update(
      { id, state: 'pending', expiresAt: MoreThan(new Date()) },
      { state: 'approved', approvedUserId: userId, approvedAt: new Date() }
    );
    return !!result.affected;
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
    const result = await this.repository.update(
      { id, state: 'approved', expiresAt: MoreThan(new Date()) },
      { state: 'claiming', claimedAt: new Date(), claimLease: lease }
    );
    if (!result.affected) return null;
    return this.repository.findOne({ where: { id } });
  }

  async completeClaim(id: string, lease: string): Promise<boolean> {
    const result = await this.repository.update(
      { id, state: 'claiming', claimLease: lease },
      { state: 'claimed', claimLease: null }
    );
    return !!result.affected;
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
