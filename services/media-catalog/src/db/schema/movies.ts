import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { timestamps } from './shared';

export const movies = sqliteTable(
  'movies',
  {
    mediaId: integer('media_id').primaryKey(),
    imdbId: text('imdb_id'),
    title: text().notNull().default(''),
    overview: text().notNull().default(''),
    tagline: text().notNull().default(''),
    releaseDate: text('release_date').notNull().default(''),
    runtime: integer().notNull().default(0),
    poster: text().notNull().default(''),
    backdrop: text().notNull().default(''),
    logo: text().notNull().default(''),
    popularity: real().notNull().default(0),
    rating: real().notNull().default(0),
    detailsSyncedAt: integer('details_synced_at'),
    ...timestamps,
  },
  table => [
    uniqueIndex('movies_imdb')
      .on(table.imdbId)
      .where(sql`imdb_id IS NOT NULL`),
  ]
);

export type MovieRecord = typeof movies.$inferSelect;
