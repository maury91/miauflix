import type { MediaDto, PreloadPreparationSnapshot } from '@miauwatch/backend';
import { formatRuntime, getMediaTitle } from '@shared/lib/media.utils';
import { qualityLabel, type QualityState, sourceQualityState } from '@shared/lib/source-quality';

export type SourceAvailability = 'available' | 'pending' | 'unavailable' | null | undefined;

/** The source's state in one badge: checking, no source, or the quality and how clean it is. */
export type HeroStatus =
  | { kind: 'checking' }
  | { kind: 'unavailable' }
  | { kind: 'quality'; label: string; state: QualityState };

/** What the hero's details say about a title, for the DOM hero, the drawn one and the reader. */
export interface HeroDetailsModel {
  title: string;
  /** Runtime (movies) and year, in order. */
  metadata: string[];
  /** One decimal, or null without a rating. */
  rating: string | null;
  status: HeroStatus | null;
  /** The genres on one line, or null without any. */
  genres: string | null;
  overview: string;
}

export function heroDetailsModel(
  media: MediaDto,
  preparation: PreloadPreparationSnapshot | null = null,
  availability: SourceAvailability = undefined
): HeroDetailsModel {
  const date = media._type === 'movie' ? media.releaseDate : media.firstAirDate;
  return {
    title: getMediaTitle(media),
    metadata: [
      media._type === 'movie' && media.runtime ? formatRuntime(media.runtime) : '',
      date?.slice(0, 4) ?? '',
    ].filter(Boolean),
    rating: media.rating ? media.rating.toFixed(1) : null,
    status: heroStatus(media, preparation, availability),
    genres: media.genres.length ? media.genres.join(' · ') : null,
    overview: media.overview ?? '',
  };
}

/** SourcePreparationStatus's state as one badge (movies only, as there). */
function heroStatus(
  media: MediaDto,
  preparation: PreloadPreparationSnapshot | null,
  availability: SourceAvailability
): HeroStatus | null {
  if (media._type !== 'movie') return null;
  if (preparation && preparation.playable.kind !== 'movie') return null;
  const unavailable =
    availability === 'unavailable' ||
    (availability !== 'available' && preparation?.state === 'unavailable');
  if (unavailable) return { kind: 'unavailable' };
  if (!preparation || preparation.state === 'checking') return { kind: 'checking' };
  const source = preparation.source;
  // Unknown resolution gets a display-only fallback once a source is available
  const quality = source && source.quality == null ? '720p' : qualityLabel(source?.quality ?? null);
  if (!quality) return null;
  return { kind: 'quality', label: quality, state: sourceQualityState(source?.sourceType ?? null) };
}
