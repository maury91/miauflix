import type { LanguagePreferences, UserDto } from '@miauflix/backend';

/** Nothing chosen yet: everything follows the device's language. */
export const DEFAULT_LANGUAGE_PREFERENCES: LanguagePreferences = {
  interface: null,
  audio: { default: null, anime: null },
  subtitles: { default: null, anime: null },
};

/** A profile's languages; a server from before preferences sends none. */
export function languagePreferencesOf(user: UserDto | null | undefined): LanguagePreferences {
  return user?.languagePreferences ?? DEFAULT_LANGUAGE_PREFERENCES;
}

/** What a title plays and shows by default, for this profile and this kind of title. */
export interface TitleLanguages {
  /** An ISO 639-1 code, `original`, or null to follow the device. */
  audio: string | null;
  /** An ISO 639-1 code, or null to follow the device. */
  subtitles: string | null;
}

/** The movie and show choices, with anime's own where it has one. */
export function titleLanguages(preferences: LanguagePreferences, anime: boolean): TitleLanguages {
  return {
    audio: (anime ? preferences.audio.anime : null) ?? preferences.audio.default,
    subtitles: (anime ? preferences.subtitles.anime : null) ?? preferences.subtitles.default,
  };
}
