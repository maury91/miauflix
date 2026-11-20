jest.mock('@logger');
jest.unmock('@database/database');

import { createTestDatabase } from '@__test-utils__/database.helpers';

import type { Database } from '@database/database';
import { UserRole } from '@entities/user.entity';
import type { RefreshTokenRepository } from '@repositories/refresh-token.repository';

describe('RefreshTokenRepository rotation', () => {
  let helper: ReturnType<typeof createTestDatabase>;
  let database: Database;
  let repository: RefreshTokenRepository;
  let userId: string;

  beforeEach(async () => {
    helper = createTestDatabase();
    database = await helper.setupTestDatabase();
    repository = database.getRefreshTokenRepository();
    const user = await database
      .getUserRepository()
      .create({ email: 'tv@example.com', passwordHash: 'hashed', role: UserRole.USER });
    userId = user.id;
    await repository.create({
      token: 'first',
      userId,
      session: 'session-1',
      expiresAt: new Date(Date.now() + 86_400_000),
      lastAccessedAt: new Date(),
    });
  });

  afterEach(() => helper.cleanup());

  const later = () => new Date(Date.now() + 86_400_000);

  it('replaces the token a client never received, keeping the rotation it came from', async () => {
    await expect(
      repository.updateToken('first', 'lost', userId, 'session-1', later(), '10.0.0.1')
    ).resolves.toBe(true);
    const rotated = await repository.findByPreviousToken('first', 'session-1');
    expect(rotated?.user.id).toBe(userId);

    await expect(
      repository.replaceRotatedToken(rotated!, 'recovered', later(), '10.0.0.1')
    ).resolves.toBe(true);

    expect(await repository.findByToken('lost', 'session-1')).toBeNull();
    expect(await repository.findByToken('recovered', 'session-1')).not.toBeNull();
    const after = await repository.findByPreviousToken('first', 'session-1');
    expect(after?.rotatedAt?.getTime()).toBe(rotated?.rotatedAt?.getTime());
    expect(after?.accessCount).toBe(rotated!.accessCount + 1);
  });

  it("doesn't replace a token that changed since it was read", async () => {
    await repository.updateToken('first', 'second', userId, 'session-1', later(), '10.0.0.1');
    const rotated = await repository.findByPreviousToken('first', 'session-1');
    await repository.updateToken('second', 'third', userId, 'session-1', later(), '10.0.0.1');

    await expect(
      repository.replaceRotatedToken(rotated!, 'stale', later(), '10.0.0.1')
    ).resolves.toBe(false);
    expect(await repository.findByToken('third', 'session-1')).not.toBeNull();
  });
});
