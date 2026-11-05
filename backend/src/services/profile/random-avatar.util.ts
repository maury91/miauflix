import { randomPlushieLook } from '@miauflix/service-contracts';

import type { AvatarLook } from '@mytypes/avatar.types';

/**
 * A new look from the editor's "Surprise me" generator, for a profile that has none: accounts
 * created without one, the first admin, and (by migration) accounts from before profiles.
 */
export function randomAvatar(random?: () => number): AvatarLook {
  return { ...randomPlushieLook(random) };
}
