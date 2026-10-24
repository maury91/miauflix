import type { PlayableRef, ProgressEntry } from '@miauflix/backend';

interface EpisodeLike {
  episodeNumber: number;
  title: string;
  airDate: string | null;
}

interface SeasonLike<E extends EpisodeLike = EpisodeLike> {
  seasonNumber: number;
  episodes: E[];
}

type EpisodeProgress = ProgressEntry & { playable: Extract<PlayableRef, { kind: 'episode' }> };

export interface EpisodePosition {
  showMediaId: number;
  seasonNumber: number;
  episodeNumber: number;
}

export interface NextEpisode {
  playable: Extract<PlayableRef, { kind: 'episode' }>;
  title: string;
}

/** The most recently updated progress entry for a show, optionally within one season. */
export function latestEpisodeProgress(
  progress: readonly ProgressEntry[],
  showMediaId: number,
  seasonNumber?: number
): EpisodeProgress | undefined {
  let latest: EpisodeProgress | undefined;
  for (const entry of progress) {
    if (entry.playable.kind !== 'episode' || entry.playable.showMediaId !== showMediaId) continue;
    if (seasonNumber !== undefined && entry.playable.seasonNumber !== seasonNumber) continue;
    if (!latest || Date.parse(entry.updatedAt) > Date.parse(latest.updatedAt)) {
      latest = entry as EpisodeProgress;
    }
  }
  return latest;
}

/** True when the episode has an air date in the future; an unknown date is not upcoming. */
export function isEpisodeUpcoming(airDate: string | null | undefined, now = Date.now()): boolean {
  if (!airDate) return false;
  const timestamp = Date.parse(airDate);
  return Number.isFinite(timestamp) && timestamp > now;
}

/** An episode can be offered for playback once it has aired (or its date is unknown). */
export function isPlayableEpisode(episode: Pick<EpisodeLike, 'airDate'>, now = Date.now()) {
  return !isEpisodeUpcoming(episode.airDate, now);
}

/**
 * The episode a season opens on: the most recently watched one if it is still playable,
 * otherwise the first playable one, otherwise the first listed (so an unaired season still
 * shows a selection).
 */
export function episodeForSeason<E extends EpisodeLike>(
  season: SeasonLike<E>,
  showMediaId: number,
  progress: readonly ProgressEntry[],
  now = Date.now()
): E | undefined {
  const watched = latestEpisodeProgress(progress, showMediaId, season.seasonNumber);
  if (watched) {
    const matching = season.episodes.find(
      episode =>
        episode.episodeNumber === watched.playable.episodeNumber && isPlayableEpisode(episode, now)
    );
    if (matching) return matching;
  }
  return season.episodes.find(episode => isPlayableEpisode(episode, now)) ?? season.episodes[0];
}

/** The next playable episode after `episodeNumber` in the same season. */
export function nextEpisodeInSeason<E extends EpisodeLike>(
  season: SeasonLike<E> | undefined,
  episodeNumber: number,
  now = Date.now()
): E | undefined {
  return season?.episodes
    .filter(episode => episode.episodeNumber > episodeNumber && isPlayableEpisode(episode, now))
    .sort((left, right) => left.episodeNumber - right.episodeNumber)[0];
}

/** The next regular season (specials, season 0, are never "next") after `seasonNumber`. */
export function nextSeasonNumber(
  seasons: ReadonlyArray<{ seasonNumber: number }> | undefined,
  seasonNumber: number
): number | undefined {
  return (seasons ?? [])
    .filter(season => season.seasonNumber > seasonNumber && season.seasonNumber > 0)
    .sort((left, right) => left.seasonNumber - right.seasonNumber)[0]?.seasonNumber;
}

/**
 * What plays after the current episode: the next one in its season, else the first episode of
 * the next regular season. Returns null while the season that decides it is not loaded.
 */
export function nextEpisode(
  current: EpisodePosition,
  currentSeason: SeasonLike | undefined,
  nextSeason: SeasonLike | undefined,
  now = Date.now()
): NextEpisode | null {
  const inSeason = nextEpisodeInSeason(currentSeason, current.episodeNumber, now);
  if (inSeason) {
    return {
      playable: {
        kind: 'episode',
        showMediaId: current.showMediaId,
        seasonNumber: current.seasonNumber,
        episodeNumber: inSeason.episodeNumber,
      },
      title: inSeason.title,
    };
  }
  if (!currentSeason || !nextSeason) return null;
  const first = nextEpisodeInSeason(nextSeason, 0, now);
  if (!first) return null;
  return {
    playable: {
      kind: 'episode',
      showMediaId: current.showMediaId,
      seasonNumber: nextSeason.seasonNumber,
      episodeNumber: first.episodeNumber,
    },
    title: first.title,
  };
}
