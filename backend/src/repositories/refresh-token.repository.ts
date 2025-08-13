import type { DataSource, Repository } from 'typeorm';

import { RefreshToken } from '@entities/refresh-token.entity';
import type { User } from '@entities/user.entity';
import { hashToken, verifyToken } from '@utils/token-hash.util';

export class RefreshTokenRepository {
  private readonly repository: Repository<RefreshToken>;

  constructor(datasource: DataSource) {
    this.repository = datasource.getRepository(RefreshToken);
  }

  async findById(id: string): Promise<RefreshToken | null> {
    return this.repository.findOne({
      where: { id },
      relations: { user: true },
    });
  }

  async findByToken(token: string, session: string): Promise<RefreshToken | null> {
    // Get the stored token by session (should be unique per userId+session)
    const storedTokens = await this.repository.find({
      where: { session },
      relations: { user: true },
    });

    // There can be only one token per session
    if (storedTokens.length !== 1) {
      return null;
    }

    const isValid = verifyToken(token, storedTokens[0].tokenHash);
    if (isValid) {
      return storedTokens[0];
    }

    return null;
  }

  async findByUser(user: User): Promise<RefreshToken[]> {
    return this.repository.find({
      where: { userId: user.id },
      relations: { user: true },
    });
  }

  async create(refreshToken: Partial<RefreshToken> & { token: string }): Promise<RefreshToken> {
    const { token, ...tokenData } = refreshToken;
    const tokenHash = hashToken(token);

    const newRefreshToken = this.repository.create({
      ...tokenData,
      tokenHash,
    });
    return this.repository.save(newRefreshToken);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);
    return result.affected ? result.affected > 0 : false;
  }

  async deleteByUser(userId: string): Promise<boolean> {
    const result = await this.repository.delete({ userId });
    return result.affected ? result.affected > 0 : false;
  }

  async deleteExpired(): Promise<number> {
    const now = new Date();
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .where('expiresAt < :now', { now })
      .execute();

    return result.affected || 0;
  }

  async updateToken(
    oldToken: string,
    newToken: string,
    userId: string,
    session: string,
    expiresAt: Date,
    lastIpAddress: string,
    userAgent?: string
  ): Promise<boolean> {
    // First verify the old token exists and is valid
    const existingToken = await this.findByToken(oldToken, session);
    if (!existingToken || existingToken.userId !== userId) {
      return false;
    }

    const newTokenHash = hashToken(newToken);
    const updateFields: Partial<RefreshToken> = {
      tokenHash: newTokenHash,
      expiresAt,
      lastIpAddress,
      lastAccessedAt: new Date(),
      updatedAt: new Date(),
    };

    if (userAgent) {
      updateFields.userAgent = userAgent;
    }

    const result = await this.repository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({
        ...updateFields,
        accessCount: () => 'accessCount + 1',
      })
      .where('tokenHash = :oldTokenHash AND userId = :userId AND session = :session', {
        oldTokenHash: existingToken.tokenHash,
        userId,
        session,
      })
      .execute();

    return result.affected ? result.affected > 0 : false;
  }

  async isChainExpired(userId: string, session: string, maxRefreshDays: number): Promise<boolean> {
    const token = await this.repository.findOne({
      where: { userId, session },
      select: ['createdAt'],
    });

    if (!token) return true;

    const maxAge = new Date();
    maxAge.setDate(maxAge.getDate() - maxRefreshDays);

    return token.createdAt < maxAge;
  }

  async countByUser(userId: string): Promise<number> {
    return this.repository.count({ where: { userId } });
  }

  async deleteOldestByUser(userId: string): Promise<boolean> {
    const oldestToken = await this.repository.findOne({
      where: { userId },
      order: { lastAccessedAt: 'ASC' },
      select: ['id'],
    });

    if (!oldestToken) return false;

    const result = await this.repository.delete(oldestToken.id);
    return result.affected ? result.affected > 0 : false;
  }

  async saveRefreshToken(refreshToken: RefreshToken): Promise<RefreshToken> {
    return this.repository.save(refreshToken);
  }

  async findByUserAndSession(userId: string, session: string): Promise<RefreshToken | null> {
    return this.repository.findOne({
      where: { userId, session },
      relations: { user: true },
    });
  }

  async deleteByUserAndSession(userId: string, session: string): Promise<boolean> {
    const result = await this.repository.delete({ userId, session });
    return result.affected ? result.affected > 0 : false;
  }
}
