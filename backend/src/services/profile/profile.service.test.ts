import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from '@database/database';
import type { UserRepository } from '@repositories/user.repository';

import {
  InvalidAvatarImageError,
  InvalidUserIdError,
  MAX_AVATAR_IMAGE_BYTES,
  ProfileService,
} from './profile.service';

const USER_ID = '7f1c1a8e-6f3b-4c55-9a41-2b7c6c3f9d10';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);

const setupTest = async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'miauwatch-profile-'));
  const userRepository = {
    findById: jest.fn().mockResolvedValue({ id: USER_ID }),
    update: jest.fn().mockImplementation(async (id, changes) => ({ id, ...changes })),
  } as unknown as jest.Mocked<UserRepository>;
  const db = { getUserRepository: () => userRepository } as unknown as Database;
  const service = new ProfileService(db, { getOrThrow: () => dataDir } as never);
  return { service, userRepository, dataDir };
};

describe('ProfileService', () => {
  let dataDir: string | undefined;

  afterEach(async () => {
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  });

  it('saves only the fields given', async () => {
    const setup = await setupTest();
    dataDir = setup.dataDir;

    await setup.service.updateProfile(USER_ID, { displayName: 'Alex' });
    expect(setup.userRepository.update).toHaveBeenCalledWith(USER_ID, { displayName: 'Alex' });

    await setup.service.updateProfile(USER_ID, {});
    expect(setup.userRepository.update).toHaveBeenCalledTimes(1);
    expect(setup.userRepository.findById).toHaveBeenCalledWith(USER_ID);
  });

  describe('language preferences', () => {
    const languages = {
      interface: 'it',
      audio: { default: 'it', anime: 'original' },
      subtitles: { default: 'it', anime: null },
    };

    it('saves automatic subtitles when given', async () => {
      const setup = await setupTest();
      dataDir = setup.dataDir;

      await setup.service.updateLanguagePreferences(USER_ID, { ...languages, autoSubtitles: true });
      expect(setup.userRepository.update).toHaveBeenCalledWith(USER_ID, {
        languagePreferences: { ...languages, autoSubtitles: true },
      });
    });

    it('keeps the stored automatic subtitles for a client from before the setting', async () => {
      const setup = await setupTest();
      dataDir = setup.dataDir;
      setup.userRepository.findById.mockResolvedValue({
        id: USER_ID,
        languagePreferences: { ...languages, autoSubtitles: true },
      } as never);

      await setup.service.updateLanguagePreferences(USER_ID, { ...languages, interface: 'lt' });
      expect(setup.userRepository.update).toHaveBeenCalledWith(USER_ID, {
        languagePreferences: { ...languages, interface: 'lt', autoSubtitles: true },
      });
    });

    it('leaves automatic subtitles off for preferences stored before the setting', async () => {
      const setup = await setupTest();
      dataDir = setup.dataDir;

      await setup.service.updateLanguagePreferences(USER_ID, languages);
      expect(setup.userRepository.update).toHaveBeenCalledWith(USER_ID, {
        languagePreferences: { ...languages, autoSubtitles: false },
      });
    });
  });

  it('marks the saved picture as outdated when the look changes', async () => {
    const setup = await setupTest();
    dataDir = setup.dataDir;
    const avatar = { kind: 'pill', color: '#a65ce8' } as never;

    await setup.service.updateProfile(USER_ID, { avatar });
    expect(setup.userRepository.update).toHaveBeenCalledWith(USER_ID, {
      avatar,
      avatarRenderedAt: null,
    });
  });

  it('writes the avatar image into the data directory and records when', async () => {
    const setup = await setupTest();
    dataDir = setup.dataDir;

    await setup.service.saveAvatarImage(USER_ID, PNG);

    expect(await readFile(join(setup.dataDir, 'avatars', `${USER_ID}.png`))).toEqual(PNG);
    expect(setup.userRepository.update).toHaveBeenCalledWith(USER_ID, {
      avatarRenderedAt: expect.any(Date),
    });
    await expect(setup.service.getAvatarImage(USER_ID)).resolves.toEqual(PNG);
  });

  it('rejects images that are not PNG or too large', async () => {
    const setup = await setupTest();
    dataDir = setup.dataDir;

    await expect(setup.service.saveAvatarImage(USER_ID, Buffer.from('GIF89a'))).rejects.toThrow(
      InvalidAvatarImageError
    );
    const large = Buffer.concat([PNG, Buffer.alloc(MAX_AVATAR_IMAGE_BYTES)]);
    await expect(setup.service.saveAvatarImage(USER_ID, large)).rejects.toThrow(
      InvalidAvatarImageError
    );
    expect(setup.userRepository.update).not.toHaveBeenCalled();
  });

  it.each(['../secrets', 'a/b', `${'0'.repeat(8)}-..-..`])(
    'refuses %s as a user id for an avatar file',
    async userId => {
      const setup = await setupTest();
      dataDir = setup.dataDir;
      await expect(setup.service.getAvatarImage(userId)).rejects.toThrow(InvalidUserIdError);
      await expect(setup.service.saveAvatarImage(userId, PNG)).rejects.toThrow(InvalidUserIdError);
      expect(setup.userRepository.update).not.toHaveBeenCalled();
    }
  );

  it('returns null for a profile without an image', async () => {
    const setup = await setupTest();
    dataDir = setup.dataDir;
    await expect(setup.service.getAvatarImage(USER_ID)).resolves.toBeNull();
  });
});
