import type { MatchedBy, SourceSearchRequest } from '@miauflix/service-contracts';

import type { Param, Provider, ProviderQuery } from '../providers/types';
export interface Variant {
  query: ProviderQuery;
  matchedBy: MatchedBy;
}
export function variantsFor(provider: Provider, request: SourceSearchRequest): Variant[] {
  const kind =
    request.media.isAnime && provider.caps.anime.length
      ? 'anime'
      : request.media.kind === 'movie'
        ? 'movie'
        : 'tv';
  const caps = provider.caps[kind];
  if (!caps.length) return [];
  const result: Variant[] = [];
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
  if (caps.includes('q'))
    for (const title of new Set(
      [request.media.title, request.media.originalTitle].filter((v): v is string => !!v)
    )) {
      const queries =
        kind === 'movie'
          ? [`${title}${request.media.year ? ' ' + request.media.year : ''}`]
          : [
              `${title} S${String(request.season ?? 1).padStart(2, '0')}E${String(request.episode ?? 1).padStart(2, '0')}`,
              `${title} S${String(request.season ?? 1).padStart(2, '0')}`,
              `${title} Season ${request.season ?? 1}`,
            ];
      for (const q of queries) result.push({ query: { kind, q }, matchedBy: 'title' });
    }
  return result.map(v => ({
    ...v,
    query: Object.fromEntries(
      Object.entries(v.query).filter(
        ([k, v]) => k === 'kind' || (v !== undefined && caps.includes(k as Param))
      )
    ) as unknown as ProviderQuery,
  }));
}
