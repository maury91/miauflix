import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const genres = sqliteTable('genres', { id: integer().primaryKey() });

export const mediaGenres = sqliteTable(
  'media_genres',
  {
    mediaType: text('media_type').notNull(),
    mediaId: integer('media_id').notNull(),
    genreId: integer('genre_id').notNull(),
  },
  table => [primaryKey({ columns: [table.mediaType, table.mediaId, table.genreId] })]
);

export const translations = sqliteTable(
  'translations',
  {
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id').notNull(),
    language: text().notNull(),
    title: text().notNull().default(''),
    overview: text().notNull().default(''),
    tagline: text().notNull().default(''),
  },
  table => [primaryKey({ columns: [table.entityType, table.entityId, table.language] })]
);

export type TranslationRecord = typeof translations.$inferSelect;
