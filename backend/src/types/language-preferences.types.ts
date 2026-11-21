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
}

export const DEFAULT_LANGUAGE_PREFERENCES: LanguagePreferences = {
  interface: null,
  audio: { default: null, anime: null },
  subtitles: { default: null, anime: null },
};
