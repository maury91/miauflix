import type { PlayableRef } from '@miauflix/backend';

export interface MediaSubtitles {
  language: string;
  hearingImpaired: boolean;
  selectedFileId: number | null;
  offset: number;
}

export function mediaSubtitleKey(userId: string | undefined, playable: PlayableRef) {
  const media =
    playable.kind === 'movie'
      ? `m:${playable.mediaId}`
      : `e:${playable.showMediaId}:${playable.seasonNumber}:${playable.episodeNumber}`;
  return `miauflix.media-subtitles.${userId ?? 'anonymous'}.${media}`;
}

export function readMediaSubtitles(key: string): MediaSubtitles | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    if (
      !value ||
      typeof value.language !== 'string' ||
      !/^[a-z]{2,3}$/i.test(value.language) ||
      typeof value.hearingImpaired !== 'boolean' ||
      !Number.isFinite(value.offset) ||
      (value.selectedFileId !== null &&
        (!Number.isSafeInteger(value.selectedFileId) || value.selectedFileId <= 0))
    )
      return null;
    return {
      language: value.language,
      hearingImpaired: value.hearingImpaired,
      selectedFileId: value.selectedFileId,
      offset: value.offset,
    };
  } catch {
    return null;
  }
}

export function saveMediaSubtitles(key: string, preferences: MediaSubtitles): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(preferences));
  } catch {
    /* Storage can be unavailable. */
  }
}
