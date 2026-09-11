import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { timestamps } from './shared';
import { tvShows } from './tv-shows';

export const seasons = sqliteTable(
  'seasons',
  {
    mediaId: integer('media_id').primaryKey(),
    tvMediaId: integer('tv_media_id')
      .notNull()
      .references(() => tvShows.mediaId, { onDelete: 'cascade' }),
    seasonNumber: integer('season_number').notNull(),
    name: text().notNull().default(''),
    overview: text().notNull().default(''),
    airDate: text('air_date'),
    poster: text(),
    synced: integer().notNull().default(0),
    episodesSyncedAt: integer('episodes_synced_at'),
    ...timestamps,
  },
  table => [uniqueIndex('seasons_tv_number').on(table.tvMediaId, table.seasonNumber)]
);

export const episodes = sqliteTable(
  'episodes',
  {
    mediaId: integer('media_id').primaryKey(),
    seasonMediaId: integer('season_media_id')
      .notNull()
      .references(() => seasons.mediaId, { onDelete: 'cascade' }),
    episodeNumber: integer('episode_number').notNull(),
    name: text().notNull().default(''),
    overview: text().notNull().default(''),
    airDate: text('air_date'),
    still: text(),
    ...timestamps,
  },
  table => [uniqueIndex('episodes_season_number').on(table.seasonMediaId, table.episodeNumber)]
);

export type SeasonRecord = typeof seasons.$inferSelect;
export type EpisodeRecord = typeof episodes.$inferSelect;
