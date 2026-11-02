import type { Param, ProviderCaps } from '../types';

const PARAMS: Record<string, Param> = {
  q: 'q',
  imdbid: 'imdbid',
  tmdbid: 'tmdbid',
  tvdbid: 'tvdbid',
  season: 'season',
  ep: 'ep',
};

export interface CapsInput {
  modes?: Record<string, string[]>;
  categorymappings?: { id: string | number; cat?: string }[];
  /** The short form: the site's category id to a Torznab category name. */
  categories?: Record<string, string>;
}

/**
 * What a definition's `caps` section offers: the search parameters per kind of media and the
 * site's category ids per kind. Shared by the engine and the catalog, so the filters of the
 * indexer picker describe definitions we cannot run (private trackers) the same way.
 */
export function deriveCaps(
  input: CapsInput,
  paged = false
): { caps: ProviderCaps; categories: { movie: string[]; tv: string[]; anime: string[] } } {
  const mappings =
    input.categorymappings ??
    Object.entries(input.categories ?? {}).map(([id, cat]) => ({ id, cat: String(cat) }));
  const modes = input.modes ?? {};
  const ids = (match: (cat: string) => boolean) =>
    mappings.filter(m => match(m.cat ?? '')).map(m => String(m.id));
  const categories = {
    movie: ids(cat => cat.startsWith('Movies')),
    tv: ids(cat => cat.startsWith('TV') && !cat.startsWith('TV/Anime')),
    anime: ids(cat => cat.startsWith('TV/Anime') || cat.startsWith('Anime')),
  };
  const unrestricted = mappings.length === 0;
  const params = (mode: string): Param[] => [
    ...new Set(
      (Array.isArray(modes[mode]) ? modes[mode] : []).flatMap(token =>
        PARAMS[token] ? [PARAMS[token]] : []
      )
    ),
  ];
  const page: Param[] = paged ? ['page'] : [];
  // A mode's own list is authoritative (an ID-only API has no text search); a mode that is
  // missing falls back to plain `search`.
  const forMode = (mode: string): Param[] => (modes[mode] ? params(mode) : params('search'));
  const capsFor = (mode: string, offered: boolean): Param[] => {
    const list = forMode(mode);
    return offered && list.length ? [...list, ...page] : [];
  };
  return {
    categories,
    caps: {
      movie: capsFor('movie-search', unrestricted || categories.movie.length > 0),
      tv: capsFor('tv-search', unrestricted || categories.tv.length > 0),
      anime: categories.anime.length && params('search').includes('q') ? ['q'] : [],
    },
  };
}
