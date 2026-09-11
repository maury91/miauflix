import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { timestamps } from './shared';

export const tvShows = sqliteTable('tv_shows', {
  mediaId: integer('media_id').primaryKey(),
  imdbId: text('imdb_id'),
  name: text().notNull().default(''),
  overview: text().notNull().default(''),
  tagline: text().notNull().default(''),
  firstAirDate: text('first_air_date').notNull().default(''),
  poster: text().notNull().default(''),
  backdrop: text().notNull().default(''),
  status: text().notNull().default(''),
  type: text().notNull().default(''),
  inProduction: integer('in_production').notNull().default(0),
  episodeRunTime: text('episode_run_time').notNull().default('[]'),
  popularity: real().notNull().default(0),
  rating: real().notNull().default(0),
  watching: integer().notNull().default(0),
  detailsSyncedAt: integer('details_synced_at'),
  ...timestamps,
});

export type TVShowRecord = typeof tvShows.$inferSelect;
