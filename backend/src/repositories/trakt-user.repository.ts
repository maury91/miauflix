import type { DataSource, Repository } from 'typeorm';

import { TraktUser } from '@entities/trakt-user.entity';
import type { User } from '@entities/user.entity';

export class TraktUserRepository {
  private readonly repository: Repository<TraktUser>;

  constructor(datasource: DataSource) {
    this.repository = datasource.getRepository(TraktUser);
  }

  async findById(id: string): Promise<TraktUser | null> {
    return this.repository.findOne({
      where: { id },
      relations: { user: true },
    });
  }

  async findByUserId(userId: string): Promise<TraktUser | null> {
    return this.repository.findOne({
      where: { userId },
      relations: { user: true },
    });
  }

  async findByTraktSlug(traktSlug: string): Promise<TraktUser | null> {
    return this.repository.findOne({
      where: { traktSlug },
      relations: { user: true },
    });
  }

  async create(traktUser: Partial<TraktUser>): Promise<TraktUser> {
    const newTraktUser = this.repository.create(traktUser);
    return this.repository.save(newTraktUser);
  }

  async update(id: string, traktUser: Partial<TraktUser>): Promise<TraktUser | null> {
    await this.repository.update(id, traktUser);
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);
    return result.affected ? result.affected > 0 : false;
  }

  async associateUser(traktSlug: string, user: User): Promise<TraktUser> {
    // Find or create the Trakt user record
    const traktUser = await this.findByTraktSlug(traktSlug);
    if (traktUser) {
      // If the traktSlug already exists, we can return it
      if (traktUser.userId === user.id) {
        return traktUser;
      }
      throw new Error(`Trakt user with slug ${traktSlug} is already associated with another user.`);
    }

    // First check if this user is already associated with another Trakt account
    const existingAssociation = await this.findByUserId(user.id);
    if (existingAssociation) {
      if (existingAssociation.traktSlug === traktSlug) {
        // Already associated with the same Trakt account, no action needed
        return existingAssociation;
      }
      // Remove
      await this.repository.delete(existingAssociation.id);
    }

    return await this.create({
      traktSlug,
      user,
      userId: user.id,
    });
  }

  async updateTokens(
    traktSlug: string,
    accessToken: string,
    refreshToken: string,
    expiresIn: number
  ): Promise<TraktUser> {
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    let traktUser = await this.findByTraktSlug(traktSlug);
    if (!traktUser) {
      traktUser = await this.create({
        traktSlug,
        accessToken,
        refreshToken,
        tokenExpiresAt: expiresAt,
      });
    } else {
      traktUser.accessToken = accessToken;
      traktUser.refreshToken = refreshToken;
      traktUser.tokenExpiresAt = expiresAt;
      await this.repository.save(traktUser);
    }

    return traktUser;
  }

  async saveTraktUser(traktUser: TraktUser): Promise<TraktUser> {
    return this.repository.save(traktUser);
  }
}
