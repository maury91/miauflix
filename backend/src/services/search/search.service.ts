import type {
  MediaRef,
  MediaSummary,
  SearchGenreKey,
  SearchResponse,
} from '@miauflix/service-contracts';

import type { RecentSearchRepository } from '@repositories/recent-search.repository';
import type {
  SearchPageDto,
  SearchRecentDto,
  SearchRecentKind,
  SearchResultDetailDto,
  SearchResultDto,
} from '@routes/search.types';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';

export type SearchInput =
  | { query: string; genre?: undefined; page: number; language: string }
  | { query?: undefined; genre: SearchGenreKey; page: number; language: string };

const toResult = (summary: MediaSummary): SearchResultDto => ({
  _type: summary.mediaType === 'movie' ? 'movie' : 'tvshow',
  mediaId: summary.mediaId,
  title: summary.title,
  overview: summary.overview,
  poster: summary.poster,
  backdrop: summary.backdrop,
  releaseDate: summary.releaseDate,
  rating: summary.rating,
});

/** Title and genre search through the catalog, plus the user's recent searches. */
export class SearchService {
  constructor(
    private readonly catalog: Pick<CatalogClientService, 'batch' | 'discover' | 'search'>,
    private readonly recents: RecentSearchRepository
  ) {}

  async run(input: SearchInput): Promise<SearchPageDto> {
    const response: SearchResponse =
      input.genre !== undefined
        ? await this.catalog.discover(input.genre, input.page, input.language)
        : await this.catalog.search(input.query, input.page, input.language);
    return {
      page: response.page,
      totalPages: response.totalPages,
      totalResults: response.totalResults,
      results: response.results.map(toResult),
    };
  }

  /** Full catalog details for the runtime / season count the search summaries lack. */
  async enrich(results: SearchResultDto[], language: string): Promise<SearchResultDetailDto[]> {
    if (!results.length) return [];
    const refs: MediaRef[] = results.slice(0, 50).map(result => ({
      mediaType: result._type === 'movie' ? 'movie' : 'tv',
      mediaId: result.mediaId,
    }));
    const { items } = await this.catalog.batch(refs, language, 'prefetch');
    return items.map(item =>
      item.mediaType === 'movie'
        ? {
            _type: 'movie',
            mediaId: item.mediaId,
            runtime: item.runtime || undefined,
            logo: item.logo || undefined,
          }
        : {
            _type: 'tvshow',
            mediaId: item.mediaId,
            seasonCount: item.seasons.filter(season => season.seasonNumber > 0).length,
            logo: item.logo || undefined,
          }
    );
  }

  async listRecents(userId: string): Promise<SearchRecentDto[]> {
    return (await this.recents.list(userId)).map(entry => ({
      kind: entry.kind,
      query: entry.query,
      searchedAt: entry.searchedAt.toISOString(),
    }));
  }

  recordRecent(userId: string, kind: SearchRecentKind, query: string): Promise<void> {
    return this.recents.record(userId, kind, query);
  }

  removeRecent(userId: string, kind: SearchRecentKind, query: string): Promise<void> {
    return this.recents.remove(userId, kind, query);
  }
}
