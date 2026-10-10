import type { CreatePlaybackSessionResponse } from '@miauflix/backend';

export function audioLanguage(code: string | null): string | undefined {
  if (!code) return undefined;
  try {
    return new Intl.Locale(code.replace(/_/g, '-')).language;
  } catch {
    return undefined;
  }
}

export function preferredAudioTrack(
  delivery: CreatePlaybackSessionResponse['delivery'],
  languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages
) {
  const tracks = delivery?.audioTracks ?? [];
  for (const language of languages) {
    const wanted = audioLanguage(language);
    if (!wanted) continue;
    const track = tracks.find(track => audioLanguage(track.language) === wanted);
    if (track) return track.index;
  }
  return delivery?.defaultAudioTrackIndex ?? tracks[0]?.index;
}
