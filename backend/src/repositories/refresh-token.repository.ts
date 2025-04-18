import type { DataSource, Repository } from "typeorm";

import { RefreshToken } from "@entities/refresh-token.entity";
import type { User } from "@entities/user.entity";

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

  async findByToken(token: string): Promise<RefreshToken | null> {
    return this.repository.findOne({
      where: { token },
      relations: { user: true },
    });
  }

  async findByUser(user: User): Promise<RefreshToken[]> {
    return this.repository.find({
      where: { userId: user.id },
      relations: { user: true },
    });
  }

  async create(refreshToken: Partial<RefreshToken>): Promise<RefreshToken> {
    const newRefreshToken = this.repository.create(refreshToken);
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
      .where("expiresAt < :now", { now })
      .execute();

    return result.affected || 0;
  }

  async saveRefreshToken(refreshToken: RefreshToken): Promise<RefreshToken> {
    return this.repository.save(refreshToken);
  }
}
