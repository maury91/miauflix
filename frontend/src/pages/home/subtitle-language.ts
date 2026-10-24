import { mediaSubtitleKey, readMediaSubtitles } from '@features/player/lib/media-subtitles';
import type { MediaDto, ProgressEntry } from '@miauflix/backend';

import { latestEpisodeProgress } from './episode-rules';

/**
 * The subtitle language to prepare for a title: the one last chosen for it (for a show, for
 * its most recently watched episode), else the browser language, else English.
 */
export function subtitleLanguageForMedia(
  media: MediaDto | null,
  entries: ProgressEntry[],
  userId?: string,
  browserLanguage = typeof navigator === 'undefined' ? 'en' : navigator.language
): string {
  const playable =
    media?._type === 'movie'
      ? { kind: 'movie' as const, mediaId: media.mediaId }
      : media
        ? latestEpisodeProgress(entries, media.mediaId)?.playable
        : undefined;
  const saved = playable ? readMediaSubtitles(mediaSubtitleKey(userId, playable)) : null;
  const browser = browserLanguage.split('-')[0] ?? 'en';
  return saved?.language ?? (/^[a-z]{2,3}$/i.test(browser) ? browser : 'en');
}
