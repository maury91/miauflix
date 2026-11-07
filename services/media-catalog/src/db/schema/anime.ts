import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { episodes } from './seasons';
import { tvShows } from './tv-shows';

/**
 * How a show's seasons are numbered. `anilist`: one season per AniList entry (see
 * `anime_seasons`); `tmdb`: TMDB's own seasons. `version` changes whenever the numbering does,
 * so consumers that store episode numbers know to renumber.
 */
export const animeLayouts = sqliteTable('anime_layouts', {
  tvMediaId: integer('tv_media_id')
    .primaryKey()
    .references(() => tvShows.mediaId, { onDelete: 'cascade' }),
  layout: text().notNull().default('tmdb'),
  version: text(),
  builtAt: integer('built_at').notNull(),
});

/** The seasons of a show numbered by AniList entry; season 0 stays TMDB's. */
export const animeSeasons = sqliteTable(
  'anime_seasons',
  {
    tvMediaId: integer('tv_media_id')
      .notNull()
      .references(() => tvShows.mediaId, { onDelete: 'cascade' }),
    seasonNumber: integer('season_number').notNull(),
    /** Null for episodes TMDB lists before any AniList entry holds them. */
    anilistId: integer('anilist_id'),
    name: text().notNull().default(''),
    airDate: text('air_date'),
    poster: text(),
  },
  table => [primaryKey({ columns: [table.tvMediaId, table.seasonNumber] })]
);

/** Where each TMDB episode of such a show sits in the AniList numbering. */
export const animeEpisodes = sqliteTable(
  'anime_episodes',
  {
    episodeMediaId: integer('episode_media_id')
      .primaryKey()
      .references(() => episodes.mediaId, { onDelete: 'cascade' }),
    tvMediaId: integer('tv_media_id')
      .notNull()
      .references(() => tvShows.mediaId, { onDelete: 'cascade' }),
    seasonNumber: integer('season_number').notNull(),
    episodeNumber: integer('episode_number').notNull(),
  },
  table => [
    uniqueIndex('anime_episodes_number').on(
      table.tvMediaId,
      table.seasonNumber,
      table.episodeNumber
    ),
  ]
);

export type AnimeLayoutRecord = typeof animeLayouts.$inferSelect;
export type AnimeSeasonRecord = typeof animeSeasons.$inferSelect;
export type AnimeEpisodeRecord = typeof animeEpisodes.$inferSelect;
