import { and, asc, eq, sql } from 'drizzle-orm';

import { episodeRow } from './catalog-db.mappers';
import type { EpisodeRow } from './catalog-db.types';
import type { CatalogDatabase } from './database';
import {
  animeEpisodes,
  type AnimeLayoutRecord,
  animeLayouts,
  type AnimeSeasonRecord,
  animeSeasons,
  episodes,
  seasons,
} from './schema';

export interface AnimeLayoutWrite {
  version: string;
  seasons: Omit<AnimeSeasonRecord, 'tvMediaId'>[];
  episodes: { episodeMediaId: number; seasonNumber: number; episodeNumber: number }[];
}

/** An episode of a show numbered by AniList entry, with its TMDB numbering. */
export interface AnimeEpisodeRow {
  episode: EpisodeRow;
  seasonNumber: number;
  episodeNumber: number;
  providerSeasonNumber: number;
  providerEpisodeNumber: number;
}

/** Persistence of the AniList season numbering of anime shows. */
export class AnimeLayoutRepository {
  constructor(private readonly database: CatalogDatabase) {}

  private get db() {
    return this.database.db;
  }

  getLayout(tvMediaId: number): AnimeLayoutRecord | undefined {
    return this.db.select().from(animeLayouts).where(eq(animeLayouts.tvMediaId, tvMediaId)).get();
  }

  /** The show keeps TMDB's seasons. */
  saveTmdb(tvMediaId: number, builtAt: number): void {
    this.db.transaction(tx => {
      tx.delete(animeEpisodes).where(eq(animeEpisodes.tvMediaId, tvMediaId)).run();
      tx.delete(animeSeasons).where(eq(animeSeasons.tvMediaId, tvMediaId)).run();
      tx.insert(animeLayouts)
        .values({ tvMediaId, layout: 'tmdb', version: null, builtAt })
        .onConflictDoUpdate({
          target: animeLayouts.tvMediaId,
          set: { layout: 'tmdb', version: null, builtAt },
        })
        .run();
    });
  }

  /** Replaces the show's AniList numbering. */
  saveAnilist(tvMediaId: number, layout: AnimeLayoutWrite, builtAt: number): void {
    this.db.transaction(tx => {
      tx.delete(animeEpisodes).where(eq(animeEpisodes.tvMediaId, tvMediaId)).run();
      tx.delete(animeSeasons).where(eq(animeSeasons.tvMediaId, tvMediaId)).run();
      for (const season of layout.seasons)
        tx.insert(animeSeasons)
          .values({ ...season, tvMediaId })
          .run();
      for (const episode of layout.episodes)
        tx.insert(animeEpisodes)
          .values({ ...episode, tvMediaId })
          .run();
      tx.insert(animeLayouts)
        .values({ tvMediaId, layout: 'anilist', version: layout.version, builtAt })
        .onConflictDoUpdate({
          target: animeLayouts.tvMediaId,
          set: { layout: 'anilist', version: layout.version, builtAt },
        })
        .run();
    });
  }

  getSeasons(tvMediaId: number): (AnimeSeasonRecord & { episodeCount: number })[] {
    const counts = new Map(
      this.db
        .select({
          seasonNumber: animeEpisodes.seasonNumber,
          total: sql<number>`count(*)`,
        })
        .from(animeEpisodes)
        .where(eq(animeEpisodes.tvMediaId, tvMediaId))
        .groupBy(animeEpisodes.seasonNumber)
        .all()
        .map(row => [row.seasonNumber, row.total])
    );
    return this.db
      .select()
      .from(animeSeasons)
      .where(eq(animeSeasons.tvMediaId, tvMediaId))
      .orderBy(asc(animeSeasons.seasonNumber))
      .all()
      .map(season => ({ ...season, episodeCount: counts.get(season.seasonNumber) ?? 0 }));
  }

  getSeason(tvMediaId: number, seasonNumber: number): AnimeSeasonRecord | undefined {
    return this.db
      .select()
      .from(animeSeasons)
      .where(
        and(eq(animeSeasons.tvMediaId, tvMediaId), eq(animeSeasons.seasonNumber, seasonNumber))
      )
      .get();
  }

  /** Episodes of the show in AniList numbering (one season, or all), in order. */
  getEpisodes(tvMediaId: number, seasonNumber?: number): AnimeEpisodeRow[] {
    const where =
      seasonNumber === undefined
        ? eq(animeEpisodes.tvMediaId, tvMediaId)
        : and(eq(animeEpisodes.tvMediaId, tvMediaId), eq(animeEpisodes.seasonNumber, seasonNumber));
    return this.db
      .select({
        episode: episodes,
        seasonNumber: animeEpisodes.seasonNumber,
        episodeNumber: animeEpisodes.episodeNumber,
        providerSeasonNumber: seasons.seasonNumber,
      })
      .from(animeEpisodes)
      .innerJoin(episodes, eq(episodes.mediaId, animeEpisodes.episodeMediaId))
      .innerJoin(seasons, eq(seasons.mediaId, episodes.seasonMediaId))
      .where(where)
      .orderBy(asc(animeEpisodes.seasonNumber), asc(animeEpisodes.episodeNumber))
      .all()
      .map(row => ({
        episode: episodeRow(row.episode),
        seasonNumber: row.seasonNumber,
        episodeNumber: row.episodeNumber,
        providerSeasonNumber: row.providerSeasonNumber,
        providerEpisodeNumber: row.episode.episodeNumber,
      }));
  }
}
