import { randomAvatar } from '@services/profile/random-avatar.util';

import type { Migration } from './migration.types';

/** Give accounts from before profiles a Plushie, as "Surprise me" would, once. */
export const generateMissingAvatars: Migration = async ({ db, logger }) => {
  const users = db.getUserRepository();
  const missing = await users.findWithoutAvatar();
  for (const { id } of missing) {
    await users.update(id, { avatar: randomAvatar() });
  }
  if (missing.length) logger.info('Migrations', `Generated avatars for ${missing.length} profiles`);
};
