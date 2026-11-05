jest.mock('@logger');
jest.unmock('@database/database');

import { createTestDatabase } from '@__test-utils__/database.helpers';
import { logger } from '@logger';
import { PLUSHIE_KINDS } from '@miauflix/service-contracts';

import { User, UserRole } from '@entities/user.entity';

import { generateMissingAvatars } from './generate-missing-avatars.migration';

describe('generateMissingAvatars', () => {
  const dbHelper = createTestDatabase();

  afterEach(async () => {
    await dbHelper.cleanup();
  });

  const setupTest = async () => {
    const db = await dbHelper.setupTestDatabase();
    const users = db.getRepository(User);
    const create = (email: string, avatar: User['avatar']) =>
      users.save(users.create({ email, passwordHash: 'hash', role: UserRole.USER, avatar }));
    return { db, users, create };
  };

  it('gives accounts without a look a generated Plushie and keeps chosen looks', async () => {
    const { db, users, create } = await setupTest();
    const chosen = { kind: 'heart', color: '#3d9be9' };
    const before = await create('before@example.com', null);
    const styled = await create('styled@example.com', chosen);

    await generateMissingAvatars({ db, logger });

    const generated = (await users.findOneByOrFail({ id: before.id })).avatar;
    expect(PLUSHIE_KINDS).toContain(generated?.['kind']);
    expect(generated?.['color']).toMatch(/^#[0-9a-f]{6}$/i);
    expect((await users.findOneByOrFail({ id: styled.id })).avatar).toEqual(chosen);
    expect(logger.info).toHaveBeenCalledWith('Migrations', 'Generated avatars for 1 profiles');

    // Generated once: running again leaves the new look alone.
    await generateMissingAvatars({ db, logger });
    expect((await users.findOneByOrFail({ id: before.id })).avatar).toEqual(generated);
  });

  it('does nothing on an empty database', async () => {
    const { db, users } = await setupTest();
    await generateMissingAvatars({ db, logger });
    expect(await users.count()).toBe(0);
  });
});
