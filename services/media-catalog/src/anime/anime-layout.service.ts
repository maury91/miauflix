import { createHash } from 'node:crypto';

import {
  displayTitle,
  type Entry,
  layoutSeasons,
  type ProviderEpisode,
  seasonName,
  toEntry,
} from '@miauflix/anime-mapping';

import type { CatalogHydrator } from '../catalog/catalog.hydrator';
import type { AnimeLayoutRepository } from '../db/anime-layout.repo';
import type { TVShowRepository } from '../db/tv-show.repo';
import { logger } from '../logger';
import { SingleFlight } from '../utils/single-flight';
import type { AnimeIndex } from './anime-index';

const SCOPE = 'AnimeLayout';
/** More entries than this for one show are not read (long franchises keep TMDB's seasons). */
const MAX_ENTRIES = 40;
/** After an incomplete build (an ani.zip read failed), how long requests skip rebuilding. */
const FAILED_BUILD_RETRY_MS = 10 * 60_000;

/**
 * Numbers an anime show's seasons by AniList entry when TMDB keeps it in fewer seasons
 * (`layoutSeasons` decides). Built after the show's details are hydrated and rebuilt with them;
 * TMDB's own season and episode rows are left as they are.
 */
export class AnimeLayoutService {
  private readonly flights = new SingleFlight();
  /** Shows whose last build was incomplete, and when to try again. */
  private readonly retryAt = new Map<number, number>();

  constructor(
    private readonly index: AnimeIndex,
    private readonly layouts: AnimeLayoutRepository,
    private readonly tvShows: TVShowRepository,
    private readonly hydrator: CatalogHydrator,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now
  ) {}

  /** False when the anime lists are turned off: no layouts are built. */
  get enabled(): boolean {
    return this.index.enabled;
  }

  /** Builds the show's layout when missing or older than its details. Never throws. */
  async ensure(tvMediaId: number): Promise<void> {
    if (!this.index.enabled) return;
    // A failed build is not retried on every request: each retry waits on ani.zip again.
    if ((this.retryAt.get(tvMediaId) ?? 0) > this.now()) return;
    const show = this.tvShows.getTVShow(tvMediaId);
    if (!show) return;
    const current = this.layouts.getLayout(tvMediaId);
    if (
      current &&
      this.now() - current.builtAt < this.ttlMs &&
      current.builtAt >= (show.details_synced_at ?? 0)
    )
      return;
    await this.flights
      .run(`layout:${tvMediaId}`, () => this.build(tvMediaId, show.name))
      .catch(error => logger.warn(SCOPE, `Layout of show ${tvMediaId} not built`, error));
  }

  private async build(tvMediaId: number, showName: string): Promise<void> {
    const entries = await this.index.showEntries(tvMediaId);
    // The list is not available yet: keep what is stored and try again next time.
    if (entries === null) return;
    const regularSeasons = this.tvShows.getSeasonsOf(tvMediaId).filter(s => s.season_number > 0);
    const seasonEntries = entries.filter(e => e.type !== 'OVA' && e.tmdbSeason !== 0);
    // Cheap checks first: most shows never need their seasons read.
    if (
      !regularSeasons.length ||
      seasonEntries.length <= regularSeasons.length ||
      seasonEntries.length > MAX_ENTRIES ||
      seasonEntries.some(e => e.tmdbSeason === null)
    ) {
      this.layouts.saveTmdb(tvMediaId, this.now());
      return;
    }

    const providerEpisodes: ProviderEpisode[] = [];
    const posters = new Map<number, string | null>();
    for (const season of regularSeasons) {
      const { season: row, episodes } = await this.hydrator.ensureSeasonFresh(
        tvMediaId,
        season.season_number
      );
      posters.set(row.season_number, row.poster);
      for (const episode of episodes)
        providerEpisodes.push({
          mediaId: episode.media_id,
          seasonNumber: row.season_number,
          episodeNumber: episode.episode_number,
          airDate: episode.air_date,
        });
    }
    const read = await Promise.all(
      seasonEntries.map(async entry => {
        const data = await this.index.aniZip(entry.anilistId);
        return data ? toEntry(entry, data) : null;
      })
    );
    // Without every entry's episodes the split would be guesswork: keep what is stored.
    if (read.some(entry => entry === null)) {
      if (this.retryAt.size >= 1000) this.retryAt.delete(this.retryAt.keys().next().value!);
      this.retryAt.set(tvMediaId, this.now() + FAILED_BUILD_RETRY_MS);
      return;
    }
    this.retryAt.delete(tvMediaId);
    const layout = layoutSeasons(providerEpisodes, read as Entry[]);
    // Numbered exactly like TMDB (an announced entry with nothing aired yet): nothing to change.
    const sameAsTmdb = layout?.every(season =>
      season.episodes.every(
        e =>
          e.providerSeasonNumber === season.seasonNumber &&
          e.providerEpisodeNumber === e.episodeNumber
      )
    );
    if (!layout || sameAsTmdb) {
      this.layouts.saveTmdb(tvMediaId, this.now());
      return;
    }

    const seasons = layout.map(season => ({
      seasonNumber: season.seasonNumber,
      anilistId: season.anilistId,
      name: seasonName(
        showName,
        displayTitle(season.entry?.data ?? null, showName),
        season.seasonNumber
      ),
      airDate: season.episodes[0]?.airDate ?? null,
      poster: posters.get(season.episodes[0]?.providerSeasonNumber ?? 1) ?? null,
    }));
    const episodes = layout.flatMap(season =>
      season.episodes.map(episode => ({
        episodeMediaId: episode.mediaId,
        seasonNumber: season.seasonNumber,
        episodeNumber: episode.episodeNumber,
      }))
    );
    const version = createHash('sha1')
      .update(
        JSON.stringify(
          layout.map(season => [
            season.seasonNumber,
            season.anilistId,
            season.episodes.map(e => [e.mediaId, e.episodeNumber]),
          ])
        )
      )
      .digest('hex')
      .slice(0, 16);
    this.layouts.saveAnilist(tvMediaId, { version, seasons, episodes }, this.now());
    logger.info(
      SCOPE,
      `Show ${tvMediaId} numbered by AniList entry: ${seasons.length} seasons for ${regularSeasons.length} on TMDB`
    );
  }
}
