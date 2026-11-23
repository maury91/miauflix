import type { LanguagePreferences, UserDto } from '@miauwatch/backend';

/** Nothing chosen yet: everything follows the device's language. */
export const DEFAULT_LANGUAGE_PREFERENCES: LanguagePreferences = {
  interface: null,
  audio: { default: null, anime: null },
  subtitles: { default: null, anime: null },
  autoSubtitles: false,
};

/**
 * A profile's languages; a server from before preferences sends none, one from before automatic
 * subtitles leaves that setting out.
 */
export function languagePreferencesOf(user: UserDto | null | undefined): LanguagePreferences {
  return { ...DEFAULT_LANGUAGE_PREFERENCES, ...user?.languagePreferences };
}

/**
 * Whether the server stores the automatic subtitles setting. One from before it rejects
 * preferences that carry it (the TV app updates apart from the server).
 */
export function supportsAutoSubtitles(user: UserDto | null | undefined): boolean {
  return typeof user?.languagePreferences?.autoSubtitles === 'boolean';
}

/** What a title plays and shows by default, for this profile and this kind of title. */
export interface TitleLanguages {
  /** An ISO 639-1 code, `original`, or null to follow the device. */
  audio: string | null;
  /** An ISO 639-1 code, or null to follow the device. */
  subtitles: string | null;
  /** Turn subtitles in `subtitles` on when nothing is remembered for the title. */
  autoSubtitles: boolean;
}

/** The movie and show choices, with anime's own where it has one. */
export function titleLanguages(preferences: LanguagePreferences, anime: boolean): TitleLanguages {
  return {
    audio: (anime ? preferences.audio.anime : null) ?? preferences.audio.default,
    subtitles: (anime ? preferences.subtitles.anime : null) ?? preferences.subtitles.default,
    autoSubtitles: preferences.autoSubtitles,
  };
}
