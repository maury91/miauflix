import { isContractError } from '@miauflix/contract';
import {
  type ArtworkPriority,
  type ArtworkUpdate,
  type BatchResponse,
  catalog,
  type ExternalMediaLookup,
  type MediaRef,
  type MovieDetail,
  type SearchGenre,
  type SearchGenreKey,
  type SearchResponse,
  type SeasonDetail,
  type TVShowDetail,
} from '@miauflix/contracts';

import type { ConfigurationService } from '@services/configuration/configuration.service';
import { RemoteService } from '@services/remote/remote-service';

const orNull = <T>(promise: Promise<T>): Promise<T | null> =>
  promise.catch((error: unknown) => {
    if (isContractError(error, 'not_found')) return null;
    throw error;
  });

/** The catalog service, with the backend's calling conventions. */
export class CatalogClientService extends RemoteService<typeof catalog> {
  private readonly artworkStreamReadyListeners = new Set<() => void>();

  constructor(configurationService: ConfigurationService) {
    super(configurationService, {
      serviceName: 'CATALOG',
      urlKey: 'CATALOG_SERVICE_URL',
      timeoutKey: 'CATALOG_SERVICE_TIMEOUT_MS',
      contract: catalog,
    });
  }

  getMovie(mediaId: number, language: string): Promise<MovieDetail | null> {
    return orNull(this.client.getMovie({ mediaId, language }));
  }

  getTVShow(mediaId: number, language: string): Promise<TVShowDetail | null> {
    return orNull(this.client.getShow({ mediaId, language }));
  }

  getSeason(
    tvMediaId: number,
    seasonNumber: number,
    language: string
  ): Promise<SeasonDetail | null> {
    return orNull(this.client.getSeason({ tvMediaId, seasonNumber, language }));
  }

  search(query: string, page: number, language: string): Promise<SearchResponse> {
    return this.client.search({ query, page, language });
  }

  discover(genre: SearchGenreKey, page: number, language: string): Promise<SearchResponse> {
    return this.client.discover({ genre, page, language });
  }

  /** Every catalog genre, most titles first, then the search shortcuts. */
  searchGenres(language: string): Promise<SearchGenre[]> {
    return this.client.searchGenres({ language });
  }

  batch(
    items: MediaRef[],
    language: string,
    artworkPriority: 'background' | 'prefetch' | 'returned' = 'returned'
  ): Promise<BatchResponse> {
    return this.client.batch({ items, language, artworkPriority });
  }

  queueArtwork(items: MediaRef[], priority: ArtworkPriority): Promise<number> {
    return this.client.queueArtwork({ items, priority });
  }

  artworkSnapshot(items: MediaRef[]): Promise<ArtworkUpdate[]> {
    return this.client.artworkSnapshot({ items });
  }

  /** Live artwork updates. Updates missed during a disconnect are announced via onArtworkStreamReady. */
  onArtwork(listener: (update: ArtworkUpdate) => void): () => void {
    return this.client.artwork.on(listener, {
      onResync: () => {
        for (const ready of this.artworkStreamReadyListeners) ready();
      },
    });
  }

  onArtworkStreamReady(listener: () => void): () => void {
    this.artworkStreamReadyListeners.add(listener);
    return () => this.artworkStreamReadyListeners.delete(listener);
  }

  /**
   * Cached or newly computed normalized backdrop focus for a catalog title.
   * Rejects with ServiceNotConfiguredError when the catalog is not ready, and with a
   * `not_found` ContractError for an unknown title.
   */
  ensureBackdropFocus(
    mediaType: 'movie' | 'tv',
    mediaId: number
  ): Promise<{ x: number; y: number }> {
    return this.client.ensureBackdropFocus({ mediaType, mediaId });
  }

  queueBackdropFocus(items: MediaRef[]): Promise<number> {
    return this.client.queueBackdropFocus({ items });
  }

  resolveExternal(
    items: ExternalMediaLookup[]
  ): Promise<Array<{ requested: ExternalMediaLookup; media: MediaRef | null }>> {
    return this.client.resolveExternal({ items });
  }

  setWatching(mediaIds: number[]): Promise<void> {
    return this.client.setWatching({ mediaIds });
  }
}
