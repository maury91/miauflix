import type { PlaybackRef } from '@miauflix/service-contracts';

import type { Database } from '@database/database';
import { TVShow } from '@entities/tvshow.entity';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';

type EpisodeRef = Extract<PlaybackRef, { kind: 'episode' }>;
type Numbering = {
  version: string;
  toProvider: Map<string, Numbers>;
  fromProvider: Map<string, Numbers>;
};
type Numbers = { seasonNumber: number; episodeNumber: number };

const MAX_SHOWS = 200;
const at = (season: number, episode: number) => `${season}:${episode}`;

/**
 * Translates episode numbers between the catalog's numbering (what the app shows and stores)
 * and TMDB's (what Trakt speaks), for anime the catalog numbers by AniList entry. Shows that
 * keep TMDB's seasons pass through without a catalog call.
 */
export class EpisodeNumberingService {
  private readonly cache = new Map<number, Numbering>();

  constructor(
    private readonly db: Database,
    private readonly catalogClient: CatalogClientService
  ) {}

  /** The episode in TMDB's numbering. Rejects when a renumbered show's layout is unavailable. */
  async toProvider<T extends PlaybackRef>(ref: T): Promise<T> {
    return this.translate(ref, 'toProvider');
  }

  /**
   * The episode in the catalog's numbering, or null when a renumbered show has no such TMDB
   * episode (or its layout is unavailable): showing it at TMDB's numbers would be wrong.
   */
  async fromProvider<T extends PlaybackRef>(ref: T): Promise<T | null> {
    return this.translate(ref, 'fromProvider').catch(() => null);
  }

  private async translate<T extends PlaybackRef>(
    ref: T,
    direction: 'fromProvider' | 'toProvider'
  ): Promise<T> {
    if (ref.kind !== 'episode') return ref;
    const episode = ref as EpisodeRef;
    const numbering = await this.numbering(episode.showMediaId);
    if (!numbering) return ref;
    const to = numbering[direction].get(at(episode.seasonNumber, episode.episodeNumber));
    if (to) return { ...ref, ...to };
    // Specials (season 0) keep TMDB's numbers in both.
    if (episode.seasonNumber === 0) return ref;
    throw new Error(
      `Episode ${at(episode.seasonNumber, episode.episodeNumber)} of show ${episode.showMediaId} has no ${direction} numbering`
    );
  }

  private async numbering(showMediaId: number): Promise<Numbering | null> {
    const show = await this.db
      .getRepository(TVShow)
      .findOne({ select: { seasonLayoutVersion: true }, where: { mediaId: showMediaId } });
    const version = show?.seasonLayoutVersion;
    if (!version) return null;
    const cached = this.cache.get(showMediaId);
    if (cached?.version === version) return cached;
    const layout = await this.catalogClient.getEpisodeLayout(showMediaId);
    // The local episodes follow `version`; a newer catalog layout applies only once the show is
    // renumbered, so until then there is no numbering to translate with.
    if (!layout?.version || layout.version !== version)
      throw new Error(`Episode layout ${version} of show ${showMediaId} unavailable`);
    const numbering: Numbering = {
      version: layout.version,
      toProvider: new Map(),
      fromProvider: new Map(),
    };
    for (const entry of layout.episodes) {
      numbering.toProvider.set(at(entry.seasonNumber, entry.episodeNumber), {
        seasonNumber: entry.providerSeasonNumber,
        episodeNumber: entry.providerEpisodeNumber,
      });
      numbering.fromProvider.set(at(entry.providerSeasonNumber, entry.providerEpisodeNumber), {
        seasonNumber: entry.seasonNumber,
        episodeNumber: entry.episodeNumber,
      });
    }
    if (this.cache.size >= MAX_SHOWS) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(showMediaId, numbering);
    return numbering;
  }
}
