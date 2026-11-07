import type { MatchedBy, SourceSearchRequest } from '@miauflix/service-contracts';

import type { AnimeContext } from '../anime/resolver';
import type { Param, Provider, ProviderQuery } from '../providers/types';
export interface Variant {
  query: ProviderQuery;
  matchedBy: MatchedBy;
}
const pad = (n: number) => String(n).padStart(2, '0');
const ANIME_IDS: readonly Param[] = ['anidbEid', 'anidbAid', 'anilistId'];

export function variantsFor(
  provider: Provider,
  request: SourceSearchRequest,
  anime?: AnimeContext | null
): Variant[] {
  const isAnime = !!(request.media.isAnime || anime);
  const regular = request.media.kind === 'movie' ? 'movie' : 'tv';
  // Anime search is for providers built for it (anime ids, or nothing but anime). A general
  // indexer that also has an anime category keeps its movie/TV search and its id queries; the
  // anime-style title queries below are added to it.
  const animeSearch =
    isAnime &&
    provider.caps.anime.length > 0 &&
    (provider.caps.anime.some(p => ANIME_IDS.includes(p)) || !provider.caps[regular].length);
  const kind = animeSearch ? 'anime' : regular;
  const caps = provider.caps[kind];
  if (!caps.length) return [];
  const result: Variant[] = [];
  const episode = anime?.episode;
  // Anime ids first: an AniDB episode id names exactly one episode.
  if (kind === 'anime' && anime) {
    for (const [param, value, matchedBy] of [
      ['anidbEid', episode?.anidbEid, 'anidb'],
      ['anilistId', anime.anilistId, 'anilist'],
      ['anidbAid', anime.anidbAid, 'anidb'],
    ] as const) {
      if (!value || !caps.includes(param)) continue;
      // Ids of the whole entry also return its packs; the episode narrows them when supported.
      const query: ProviderQuery = { kind, [param]: value };
      if (param !== 'anidbEid' && episode && caps.includes('ep')) query.ep = episode.number;
      result.push({ query, matchedBy });
      // One exact id is enough; the entry ids are the fallback for providers without it.
      if (param === 'anidbEid') break;
    }
  }
  for (const [param, value, matchedBy] of [
    ['imdbid', request.media.imdbId, 'imdb'],
    ['tmdbid', request.media.tmdbId, 'tmdb'],
    ['tvdbid', request.media.tvdbId, 'tvdb'],
  ] as const) {
    if (value && caps.includes(param)) {
      const query: ProviderQuery = { kind, [param]: value };
      if (caps.includes('season')) query.season = request.season;
      if (caps.includes('ep')) query.ep = request.episode;
      result.push({ query, matchedBy });
    }
  }
  if (caps.includes('q')) {
    const titles = new Set(
      [request.media.title, request.media.originalTitle].filter((v): v is string => !!v)
    );
    if (isAnime && provider.caps.anime.length) {
      // Release names use the romaji or English title of the entry, then the episode number:
      // "[Group] Jujutsu Kaisen 2nd Season - 07". A search for "<title> 07" finds them with or
      // without a season marker; the absolute number covers groups that count on ("- 31").
      // A general indexer gets the entry's main title only, to keep its request count down.
      const animeTitles = [...new Set([...(anime?.titles ?? []), request.media.title])].slice(
        0,
        animeSearch ? undefined : 1
      );
      for (const title of animeTitles) {
        if (request.media.kind === 'movie') {
          result.push({ query: { kind, q: title }, matchedBy: 'title' });
          continue;
        }
        if (episode) {
          result.push({
            query: { kind, q: `${title} ${pad(episode.number)}` },
            matchedBy: 'title',
          });
          if (episode.absolute && episode.absolute !== episode.number)
            result.push({
              query: { kind, q: `${title} ${pad(episode.absolute)}` },
              matchedBy: 'title',
            });
        }
      }
    }
    for (const title of titles) {
      const queries =
        request.media.kind === 'movie'
          ? [`${title}${request.media.year ? ' ' + request.media.year : ''}`]
          : [
              `${title} S${pad(request.season ?? 1)}E${pad(request.episode ?? 1)}`,
              `${title} S${pad(request.season ?? 1)}`,
              `${title} Season ${request.season ?? 1}`,
            ];
      for (const q of queries) result.push({ query: { kind, q }, matchedBy: 'title' });
    }
  }
  const seen = new Set<string>();
  return result
    .map(v => ({
      ...v,
      query: Object.fromEntries(
        Object.entries(v.query).filter(
          ([k, v]) => k === 'kind' || (v !== undefined && caps.includes(k as Param))
        )
      ) as unknown as ProviderQuery,
    }))
    .filter(v => {
      const key = JSON.stringify(v.query).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
