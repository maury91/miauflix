import type { User } from '@entities/user.entity';
import { withDefaultLanguagePreferences } from '@mytypes/language-preferences.types';
import type { UserDto } from '@mytypes/user.types';

/** The user fields a client may see. */
export function toUserDto(
  user: Partial<Pick<User, 'languagePreferences'>> &
    Pick<User, 'avatar' | 'avatarRenderedAt' | 'displayName' | 'email' | 'id' | 'role'>
): UserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    avatar: user.avatar ?? null,
    avatarVersion: user.avatarRenderedAt ? new Date(user.avatarRenderedAt).getTime() : null,
    languagePreferences: withDefaultLanguagePreferences(user.languagePreferences),
  };
}
