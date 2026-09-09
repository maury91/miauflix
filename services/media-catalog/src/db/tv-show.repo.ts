import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { type CatalogTx, replaceGenres, replaceTranslations } from './catalog-db.helpers';
import { episodeRow, seasonRow, showRow } from './catalog-db.mappers';
import type {
  EpisodeRow,
  SeasonRow,
  TVShowRow,
  UpsertableSeason,
  UpsertableTVShow,
} from './catalog-db.types';
import { inBatches } from './catalog-db.types';
import type { CatalogDatabase } from './database';
import { episodes, seasons, tvShows } from './schema';

/** Persistence operations for TV shows and their season/episode hierarchy. */
export class TVShowRepository {
  constructor(private readonly database: CatalogDatabase) {}

  private get db() {
    return this.database.db;
  }

  getTVShow(mediaId: number): TVShowRow | undefined {
    const row = this.db.select().from(tvShows).where(eq(tvShows.mediaId, mediaId)).get();
    return row && showRow(row);
  }

  getSeasonsOf(tvMediaId: number): SeasonRow[] {
    return this.db
      .select()
      .from(seasons)
      .where(eq(seasons.tvMediaId, tvMediaId))
      .orderBy(seasons.seasonNumber)
      .all()
      .map(seasonRow);
  }

  episodeCount(seasonMediaId: number): number {
    return (
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(episodes)
        .where(eq(episodes.seasonMediaId, seasonMediaId))
        .get()?.count ?? 0
    );
  }

  upsertTVShow(show: UpsertableTVShow): void {
    const now = Date.now();
    this.db.transaction(tx => {
      tx.insert(tvShows)
        .values({
          mediaId: show.mediaId,
          imdbId: show.imdbId,
          name: show.name,
          overview: show.overview,
          tagline: show.tagline,
          firstAirDate: show.firstAirDate,
          poster: show.poster,
          backdrop: show.backdrop,
          status: show.status,
          type: show.type,
          inProduction: show.inProduction ? 1 : 0,
          episodeRunTime: JSON.stringify(show.episodeRunTime),
          popularity: show.popularity,
          rating: show.rating,
          detailsSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: tvShows.mediaId,
          set: {
            imdbId: show.imdbId,
            name: show.name,
            overview: show.overview,
            tagline: show.tagline,
            firstAirDate: show.firstAirDate,
            poster: show.poster,
            backdrop: show.backdrop,
            status: show.status,
            type: show.type,
            inProduction: show.inProduction ? 1 : 0,
            episodeRunTime: JSON.stringify(show.episodeRunTime),
            popularity: show.popularity,
            rating: show.rating,
            detailsSyncedAt: now,
            updatedAt: now,
          },
        })
        .run();
      replaceGenres(tx, 'tv', show.mediaId, show.genreIds);
      replaceTranslations(tx, 'tv', show.mediaId, show.translations);
      for (const season of show.seasons)
        this.upsertSeasonSummary(tx, { ...season, tvMediaId: show.mediaId }, now);
    });
  }

  knownTVShowIds(ids: number[]): Set<number> {
    const known = new Set<number>();
    for (const batch of inBatches(ids))
      for (const row of this.db
        .select({ mediaId: tvShows.mediaId })
        .from(tvShows)
        .where(and(inArray(tvShows.mediaId, batch), isNotNull(tvShows.detailsSyncedAt)))
        .all())
        known.add(row.mediaId);
    return known;
  }

  getSeasonRow(tvMediaId: number, seasonNumber: number): SeasonRow | undefined {
    const row = this.db
      .select()
      .from(seasons)
      .where(and(eq(seasons.tvMediaId, tvMediaId), eq(seasons.seasonNumber, seasonNumber)))
      .get();
    return row && seasonRow(row);
  }

  getSeasonWithEpisodes(
    tvMediaId: number,
    seasonNumber: number
  ): { season: SeasonRow; episodes: EpisodeRow[] } | undefined {
    const season = this.db
      .select()
      .from(seasons)
      .where(and(eq(seasons.tvMediaId, tvMediaId), eq(seasons.seasonNumber, seasonNumber)))
      .get();
    if (!season) return undefined;
    return {
      season: seasonRow(season),
      episodes: this.db
        .select()
        .from(episodes)
        .where(eq(episodes.seasonMediaId, season.mediaId))
        .orderBy(episodes.episodeNumber)
        .all()
        .map(episodeRow),
    };
  }

  private upsertSeasonSummary(
    tx: CatalogTx,
    season: {
      mediaId: number;
      tvMediaId: number;
      seasonNumber: number;
      name: string;
      overview: string;
      airDate: string | null;
      poster: string;
    },
    now: number
  ): void {
    tx.insert(seasons)
      .values({ ...season, synced: 0, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: seasons.mediaId,
        set: {
          tvMediaId: season.tvMediaId,
          seasonNumber: season.seasonNumber,
          name: season.name,
          overview: season.overview,
          airDate: season.airDate,
          poster: season.poster,
          updatedAt: now,
        },
      })
      .run();
  }

  upsertSeasonWithEpisodes(season: UpsertableSeason): void {
    const now = Date.now();
    this.db.transaction(tx => {
      tx.insert(tvShows)
        .values({ mediaId: season.tvMediaId, createdAt: now, updatedAt: now })
        .onConflictDoNothing()
        .run();
      tx.insert(seasons)
        .values({
          mediaId: season.mediaId,
          tvMediaId: season.tvMediaId,
          seasonNumber: season.seasonNumber,
          name: season.name,
          overview: season.overview,
          airDate: season.airDate,
          poster: season.poster,
          synced: 1,
          episodesSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: seasons.mediaId,
          set: {
            tvMediaId: season.tvMediaId,
            seasonNumber: season.seasonNumber,
            name: season.name,
            overview: season.overview,
            airDate: season.airDate,
            poster: season.poster,
            synced: 1,
            episodesSyncedAt: now,
            updatedAt: now,
          },
        })
        .run();
      for (const episode of season.episodes)
        tx.insert(episodes)
          .values({ ...episode, seasonMediaId: season.mediaId, createdAt: now, updatedAt: now })
          .onConflictDoUpdate({
            target: episodes.mediaId,
            set: {
              seasonMediaId: season.mediaId,
              episodeNumber: episode.episodeNumber,
              name: episode.name,
              overview: episode.overview,
              airDate: episode.airDate,
              still: episode.still,
              updatedAt: now,
            },
          })
          .run();
    });
  }

  findIncompleteSeason(watchingOnly: boolean): SeasonRow | undefined {
    const rows = this.db
      .select({ season: seasons })
      .from(seasons)
      .leftJoin(tvShows, eq(tvShows.mediaId, seasons.tvMediaId))
      .where(
        and(
          eq(seasons.synced, 0),
          watchingOnly ? eq(tvShows.watching, 1) : undefined,
          sql`NOT EXISTS (SELECT 1 FROM episodes e WHERE e.season_media_id = ${seasons.mediaId})`
        )
      )
      .orderBy(seasons.seasonNumber)
      .limit(1)
      .all();
    return rows[0] && seasonRow(rows[0].season);
  }

  markSeasonUnsynced(tvMediaId: number, seasonNumber: number): void {
    this.db
      .update(seasons)
      .set({ synced: 0, episodesSyncedAt: null })
      .where(and(eq(seasons.tvMediaId, tvMediaId), eq(seasons.seasonNumber, seasonNumber)))
      .run();
  }
}
