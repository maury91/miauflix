/** Audio language that plays the language the title was made in. */
export const ORIGINAL_AUDIO_LANGUAGE = 'original';

/** One language choice per kind of title: anime has its own. */
export interface LanguageChoice {
  /** Movies and TV shows; null follows the device's language. */
  default: string | null;
  /** Anime; null uses the movies and TV shows choice. */
  anime: string | null;
}

/**
 * A profile's language preferences. Languages are ISO 639-1 codes (`en`, `it`); audio may also
 * be `original`.
 */
export interface LanguagePreferences {
  /** Interface language; null follows the device's language. */
  interface: string | null;
  audio: LanguageChoice;
  subtitles: LanguageChoice;
  /**
   * Turn subtitles in the subtitle language on when playback starts, for titles without a
   * remembered subtitle choice.
   */
  autoSubtitles: boolean;
}

/**
 * Preferences as a client saves them: clients from before `autoSubtitles` leave it out, which
 * keeps the stored choice.
 */
export type LanguagePreferencesUpdate = Omit<LanguagePreferences, 'autoSubtitles'> & {
  autoSubtitles?: boolean;
};

export const DEFAULT_LANGUAGE_PREFERENCES: LanguagePreferences = {
  interface: null,
  audio: { default: null, anime: null },
  subtitles: { default: null, anime: null },
  autoSubtitles: false,
};

/** Stored preferences with what they predate filled in (none stored: the defaults). */
export function withDefaultLanguagePreferences(
  stored: Partial<LanguagePreferences> | null | undefined
): LanguagePreferences {
  return { ...DEFAULT_LANGUAGE_PREFERENCES, ...stored };
}
