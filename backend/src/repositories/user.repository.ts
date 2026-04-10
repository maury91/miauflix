import type { DataSource, EntityManager, Repository } from 'typeorm';

import type { UserRole } from '@entities/user.entity';
import { User } from '@entities/user.entity';

export class UserRepository {
  private readonly repository: Repository<User>;

  constructor(datasource: DataSource) {
    this.repository = datasource.getRepository(User);
  }

  async findById(id: string): Promise<User | null> {
    return this.repository.findOne({
      where: { id },
      relations: { refreshTokens: true },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({
      where: { email },
      relations: { refreshTokens: true },
    });
  }

  async create(user: Partial<User>): Promise<User> {
    const newUser = this.repository.create(user);
    return this.repository.save(newUser);
  }

  async update(id: string, user: Partial<User>): Promise<User | null> {
    await this.repository.update(id, user);
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);
    return result.affected ? result.affected > 0 : false;
  }

  async findByRole(role: UserRole): Promise<User[]> {
    return this.repository.find({ where: { role } });
  }

  async saveUser(user: User): Promise<User> {
    return this.repository.save(user);
  }

  /**
   * Creates the given user as admin only when no admin exists yet.
   * The check and insert run in the same transaction, preventing a race where
   * two concurrent requests both pass the "no admin" check and both insert.
   * Returns the new User, or null if an admin already existed.
   */
  async createAdminIfNone(user: Partial<User>): Promise<User | null> {
    return this.repository.manager.transaction(async (em: EntityManager) => {
      const existing = await em.findOne(User, { where: { role: user.role } });
      if (existing) {
        return null;
      }
      const newUser = em.create(User, user);
      return em.save(User, newUser);
    });
  }
}
