import type { MatchedBy, SourceSearchRequest } from '@miauwatch/service-contracts';

import type { AnimeContext } from '../anime/resolver';
import type { Param, Provider, ProviderQuery } from '../providers/types';
export interface Variant {
  query: ProviderQuery;
  matchedBy: MatchedBy;
}
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The tag release names give a dub or local subtitles in each language (`iTA`, `FRENCH`): a
 * search in a language adds it to the title. Languages without a common tag are searched by
 * their own titles alone: Latvian among them, as `LAT` in release names means Latin-American
 * Spanish, and Lithuanian, as the release-name parser doesn't count a bare `LT` (too common), so
 * what it found would never show as Lithuanian. Picked from the names of stored releases (`CZ`
 * over `CZECH`, `TR` over `TURKISH`); each one the parser reads as its language.
 */
export const LANGUAGE_TAGS: Readonly<Record<string, string>> = {
  it: 'ITA',
  fr: 'FRENCH',
  es: 'SPANISH',
  de: 'GERMAN',
  pt: 'PORTUGUESE',
  nl: 'DUTCH',
  sv: 'SWEDISH',
  da: 'DANISH',
  no: 'NORWEGIAN',
  fi: 'FINNISH',
  pl: 'PL',
  cs: 'CZ',
  sk: 'SK',
  hu: 'HUN',
  ro: 'ROMANIAN',
  ru: 'RUS',
  uk: 'UKR',
  tr: 'TR',
  el: 'GREEK',
  ja: 'JAPANESE',
  ko: 'KOREAN',
  zh: 'CHINESE',
  hi: 'HINDI',
};

/** A search in a language: its titles alone, and the title's queries with the language's tag. */
function languageVariants(
  kind: ProviderQuery['kind'],
  request: SourceSearchRequest,
  language: string
): Variant[] {
  const queriesOf = (title: string) =>
    request.media.kind === 'movie'
      ? [`${title}${request.media.year ? ' ' + request.media.year : ''}`]
      : [
          `${title} S${pad(request.season ?? 1)}E${pad(request.episode ?? 1)}`,
          `${title} S${pad(request.season ?? 1)}`,
        ];
  const tag = LANGUAGE_TAGS[language];
  const tagged = tag
    ? [request.media.title, request.media.originalTitle]
        .filter((title): title is string => !!title)
        .flatMap(queriesOf)
        .map(query => `${query} ${tag}`)
    : [];
  // Without a tag or titles of its own, the language is searched by the title's own queries
  // rather than not at all (the provider would count as searched).
  const own = request.media.localizedTitles?.length
    ? request.media.localizedTitles
    : tag
      ? []
      : [request.media.title];
  return [...own.flatMap(queriesOf), ...tagged].map(q => ({
    query: { kind, q },
    matchedBy: 'title' as const,
  }));
}
const ANIME_IDS: readonly Param[] = ['anidbEid', 'anidbAid', 'anilistId'];

/**
 * Providers built for anime: anime ids in their anime search, or nothing but anime. A general
 * indexer that also has an anime category is not one.
 */
export function builtForAnime(provider: Provider, regular: 'movie' | 'tv'): boolean {
  return (
    provider.caps.anime.length > 0 &&
    (provider.caps.anime.some(p => ANIME_IDS.includes(p)) || !provider.caps[regular].length)
  );
}

export function variantsFor(
  provider: Provider,
  request: SourceSearchRequest,
  anime?: AnimeContext | null
): Variant[] {
  const isAnime = !!(request.media.isAnime || anime);
  const regular = request.media.kind === 'movie' ? 'movie' : 'tv';
  // Anime search is for providers built for it. A general indexer that also has an anime
  // category keeps its movie/TV search and its id queries; the anime-style title queries below
  // are added to it.
  const animeSearch = isAnime && builtForAnime(provider, regular);
  const kind = animeSearch ? 'anime' : regular;
  const caps = provider.caps[kind];
  if (!caps.length) return [];
  const result: Variant[] = [];
  const episode = anime?.episode;
  /** "<title> 07" (and the absolute number when it differs), how anime releases are named. */
  const animeEpisodeQueries = (title: string) =>
    episode
      ? [
          `${title} ${pad(episode.number)}`,
          ...(episode.absolute && episode.absolute !== episode.number
            ? [`${title} ${pad(episode.absolute)}`]
            : []),
        ]
      : [];
  if (request.language) {
    // Ids find the title's releases whatever their language, which its own search already did
    if (caps.includes('q')) {
      result.push(...languageVariants(kind, request, request.language));
      // Anime providers search literal text: the entry's titles with the episode number, tagged
      // with the language when it has a tag (untagged they'd repeat the title's own search).
      if (animeSearch && request.media.kind !== 'movie') {
        const tag = LANGUAGE_TAGS[request.language];
        const animeTitles = new Set([...(anime?.titles ?? []), request.media.title]);
        for (const title of animeTitles)
          for (const q of animeEpisodeQueries(title))
            result.push({ query: { kind, q: tag ? `${q} ${tag}` : q }, matchedBy: 'title' });
      }
    }
    return unique(result, caps);
  }
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
      [
        request.media.title,
        request.media.originalTitle,
        ...(request.media.localizedTitles ?? []),
      ].filter((v): v is string => !!v)
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
        for (const q of animeEpisodeQueries(title))
          result.push({ query: { kind, q }, matchedBy: 'title' });
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
  return unique(result, caps);
}

/** The variants with the parameters the provider takes, each query once. */
function unique(result: Variant[], caps: readonly Param[]): Variant[] {
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
