import type { TitleLanguages } from '@features/profiles/lib/language-preferences';
import { mediaLanguage, ORIGINAL_LANGUAGE } from '@shared/i18n';

/** An audio track as the delivery lists it. */
interface Track {
  index: number;
  language: string | null;
}

/**
 * One way to watch, offered under the seek bar: `audio` is the preferred language alone,
 * `original` the title's own language with subtitles, `subtitled` the preferred language with
 * subtitles.
 */
export interface LanguageOption {
  kind: 'audio' | 'original' | 'subtitled';
  /** ISO 639-1 language of the audio. */
  audioLanguage: string;
  audioTrackIndex: number;
  /** ISO 639-1 language of the subtitles; null for none. */
  subtitleLanguage: string | null;
}

export interface LanguageOptionsInput {
  tracks: readonly Track[];
  /** The profile's choices for this kind of title. */
  preferences: TitleLanguages;
  /** The title's own language, when the catalog knows it. */
  originalLanguage: string | null;
  /** Used for choices left to the device. */
  deviceLanguage: string;
}

/**
 * The language buttons for a file's audio tracks. A button is offered only when the file has its
 * audio language; when the preferred audio is the original language, the original button covers
 * "with subtitles".
 */
export function languageOptions({
  tracks,
  preferences,
  originalLanguage,
  deviceLanguage,
}: LanguageOptionsInput): LanguageOption[] {
  const original = mediaLanguage(originalLanguage) ?? null;
  const device = mediaLanguage(deviceLanguage) ?? 'en';
  const preferredAudio =
    preferences.audio === ORIGINAL_LANGUAGE
      ? (original ?? device)
      : (mediaLanguage(preferences.audio) ?? device);
  const subtitles = mediaLanguage(preferences.subtitles) ?? device;
  const trackFor = (language: string) =>
    tracks.find(track => mediaLanguage(track.language) === language)?.index;

  const options: LanguageOption[] = [];
  const preferredTrack = trackFor(preferredAudio);
  if (preferredTrack !== undefined)
    options.push({
      kind: 'audio',
      audioLanguage: preferredAudio,
      audioTrackIndex: preferredTrack,
      subtitleLanguage: null,
    });
  const originalTrack = original ? trackFor(original) : undefined;
  if (original && originalTrack !== undefined)
    options.push({
      kind: 'original',
      audioLanguage: original,
      audioTrackIndex: originalTrack,
      subtitleLanguage: subtitles,
    });
  if (preferredTrack !== undefined && preferredAudio !== original)
    options.push({
      kind: 'subtitled',
      audioLanguage: preferredAudio,
      audioTrackIndex: preferredTrack,
      subtitleLanguage: subtitles,
    });
  return options;
}

/** The audio language the player asks the server to start with; undefined follows the device. */
export function preferredAudioLanguage(
  preferences: TitleLanguages,
  originalLanguage: string | null
): string | undefined {
  if (preferences.audio === ORIGINAL_LANGUAGE) return mediaLanguage(originalLanguage);
  return mediaLanguage(preferences.audio);
}
