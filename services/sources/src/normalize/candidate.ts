import type { MatchedBy, SourceCandidate, SourceSearchRequest } from '@miauflix/service-contracts';
import {
  calculateApproximateBitrate,
  extractSourceMetadata,
} from '@miauflix/source-metadata-extractor';

import type { Provider, ProviderQuery, RawResult } from '../providers/types';
import { buildMagnet, magnetHash, normalizeHash } from './magnet';
const normalized = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export function toCandidate(
  raw: RawResult,
  provider: Provider,
  matchedBy: MatchedBy,
  query: ProviderQuery,
  request: SourceSearchRequest,
  seal: (value: string) => string
): SourceCandidate | null {
  const hash = normalizeHash(raw.hash ?? '') ?? magnetHash(raw.magnet);
  if (!hash) return null;
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
  const batch = isShow ? (raw.batch ?? (season !== undefined && episode === undefined)) : false;
  if (
    raw.imdbid &&
    request.media.imdbId &&
    raw.imdbid.replace(/^tt/, '') !== request.media.imdbId.replace(/^tt/, '')
  )
    return null;
  if (matchedBy === 'title') {
    const title = normalized(raw.title);
    const aliases = [
      request.media.title,
      request.media.originalTitle,
      ...(query.titles ?? []),
    ].filter((s): s is string => !!s);
    if (
      !aliases.some(
        alias => title === normalized(alias) || title.startsWith(normalized(alias) + ' ')
      )
    )
      return null;
  }
  if (
    request.media.kind === 'show' &&
    request.season !== undefined &&
    !(season === request.season && (episode === request.episode || batch)) &&
    !(raw.absoluteEpisode && raw.absoluteEpisode === query.absoluteEpisode)
  )
    return null;
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
    season,
    episode,
    batch,
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
