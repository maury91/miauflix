import type { UserRole } from '@entities/user.entity';

import type { AvatarLook } from './avatar.types';

export type { AvatarLook, UserRole };

/** A user as the API and the services see it; never carries credentials. */
export interface UserDto {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  avatar: AvatarLook | null;
  /** Changes whenever a new avatar image is saved; null when the profile has no image. */
  avatarVersion: number | null;
}
