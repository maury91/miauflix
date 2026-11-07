import type { MatchedBy, SourceCandidate, SourceSearchRequest } from '@miauflix/service-contracts';
import {
  calculateApproximateBitrate,
  extractSourceMetadata,
} from '@miauflix/source-metadata-extractor';

import { type AnimeMatch, episodeAliases, matchAnimeRelease } from '../anime/release';
import type { AnimeContext } from '../anime/resolver';
import type { Provider, ProviderQuery, RawResult } from '../providers/types';
import { buildMagnet, magnetHash, normalizeHash } from './magnet';
const normalized = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
/** Anime releases start with their group: "[SubsPlease] Title - 07". */
const withoutGroup = (s: string) => s.replace(/^(?:\s*(?:\[[^\]]*\]|【[^】]*】))+/, '');
export function toCandidate(
  raw: RawResult,
  provider: Provider,
  matchedBy: MatchedBy,
  query: ProviderQuery,
  request: SourceSearchRequest,
  seal: (value: string) => string,
  anime?: AnimeContext | null
): SourceCandidate | null {
  const hash = normalizeHash(raw.hash ?? '') ?? magnetHash(raw.magnet);
  if (!hash) return null;
  // Mixed sites (Nyaa) also list music, books and software under the same names.
  if (raw.category && /^(?:audio|books|pc|console|xxx)\b/i.test(raw.category)) return null;
  const extracted = extractSourceMetadata({
    name: raw.title,
    type: raw.type,
    category: raw.category,
    trackerMetadata: raw.trackerMetadata,
    size: raw.size ?? 0,
    files: raw.files?.map(name => ({ name, size: 0 })) ?? [],
  });
  const episodeMatch = raw.title.match(/s(\d{1,2})[ ._-]*e(\d{1,3})/i),
    seasonMatch = raw.title.match(/(?:\bs|season[ ._-]*)(\d{1,2})\b/i);
  const parsedSeason = episodeMatch?.[1] ?? seasonMatch?.[1];
  const isShow = request.media.kind === 'show';
  const episode = raw.episode || extracted.episode || Number(episodeMatch?.[2]) || undefined;
  // A zero season from a provider means "unknown" unless it accompanies an episode (S00E01 specials).
  const rawSeason = raw.season === 0 && !raw.episode ? undefined : raw.season;
  const season = isShow
    ? (rawSeason ??
      extracted.season ??
      (parsedSeason === undefined ? undefined : Number(parsedSeason)))
    : undefined;
  let batch = isShow ? (raw.batch ?? (season !== undefined && episode === undefined)) : false;
  if (
    raw.imdbid &&
    request.media.imdbId &&
    raw.imdbid.replace(/^tt/, '') !== request.media.imdbId.replace(/^tt/, '')
  )
    return null;
  const title = normalized(withoutGroup(raw.title));
  const startsWith = (alias: string) =>
    title === normalized(alias) || title.startsWith(normalized(alias) + ' ');
  if (matchedBy === 'title') {
    const aliases = [
      request.media.title,
      request.media.originalTitle,
      ...(query.titles ?? []),
      ...(anime?.titles ?? []),
    ].filter((s): s is string => !!s);
    if (!aliases.some(startsWith)) return null;
  }
  let finalSeason = season,
    finalEpisode = episode;
  // Anime releases number by cour or from the first episode, so their own rules decide first; a
  // match is reported in TMDB's numbering so the backend files it under the episode it asked for.
  const show = [request.media.title, request.media.originalTitle].map(t => normalized(t ?? ''));
  const animeMatch: AnimeMatch | null =
    isShow && anime?.episode
      ? matchAnimeRelease(
          raw.title,
          anime,
          request,
          (anime.seasonTitles ?? []).some(t => !show.includes(normalized(t)) && startsWith(t)),
          request.media.year
        )
      : null;
  const providerSaysSo =
    raw.season === request.season && raw.episode !== undefined && raw.episode === request.episode;
  if (animeMatch) {
    finalSeason = request.season;
    finalEpisode = animeMatch === 'episode' ? request.episode : undefined;
    batch = animeMatch === 'pack';
  } else if (isShow && anime?.episode && !providerSaysSo) {
    return null;
  } else if (
    request.media.kind === 'show' &&
    request.season !== undefined &&
    !(season === request.season && (episode === request.episode || batch)) &&
    !(raw.absoluteEpisode && raw.absoluteEpisode === query.absoluteEpisode)
  )
    return null;
  const aliases = isShow && anime ? episodeAliases(anime, request) : [];
  const date = new Date(raw.date ?? 0);
  return {
    hash,
    magnetLink: buildMagnet(hash, raw.title, raw.magnet),
    releaseName: raw.title,
    size: Math.max(0, Number(raw.size) || 0),
    broadcasters: Math.max(0, Number(raw.seeders) || 0),
    watchers: Math.max(0, Number(raw.leechers) || 0),
    uploadDate: Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString(),
    provider: provider.id,
    providerKind: provider.kind,
    matchedBy,
    accuracy:
      matchedBy === 'title'
        ? 'low'
        : query.anidbEid || raw.anidbFid || (raw.imdbid && raw.imdbid === request.media.imdbId)
          ? 'high'
          : 'medium',
    quality: extracted.quality ?? null,
    videoCodec: extracted.videoCodec[0] ?? null,
    audioCodec: extracted.audioCodec,
    language: extracted.language,
    source: extracted.source ?? null,
    bitrate: calculateApproximateBitrate(raw.size ?? 0, raw.runtimeMinutes ?? 0),
    score: 0,
    season: finalSeason,
    episode: finalEpisode,
    batch,
    ...(aliases.length ? { episodeAliases: aliases } : {}),
    absoluteEpisode: raw.absoluteEpisode,
    release: raw.release,
    files: raw.files,
    fileRef: raw.torrentUrl
      ? seal(JSON.stringify({ provider: provider.id, url: raw.torrentUrl }))
      : undefined,
    trailerCode: raw.trailerCode,
  };
}
export function mergeCandidate(first: SourceCandidate, next: SourceCandidate): SourceCandidate {
  const ranks = { low: 0, medium: 1, high: 2 };
  const magnet = new URL(first.magnetLink);
  for (const tracker of new URL(next.magnetLink).searchParams.getAll('tr'))
    magnet.searchParams.append('tr', tracker);
  return {
    ...first,
    magnetLink: buildMagnet(first.hash, first.releaseName, magnet.href),
    matchedBy: ranks[next.accuracy] > ranks[first.accuracy] ? next.matchedBy : first.matchedBy,
    broadcasters: Math.max(first.broadcasters, next.broadcasters),
    watchers: Math.max(first.watchers, next.watchers),
    accuracy: ranks[next.accuracy] > ranks[first.accuracy] ? next.accuracy : first.accuracy,
    fileRef: first.fileRef ?? next.fileRef,
  };
}
