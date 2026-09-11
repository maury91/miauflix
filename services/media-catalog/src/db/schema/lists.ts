import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const lists = sqliteTable('lists', {
  slug: text().primaryKey(),
  name: text().notNull(),
  description: text().notNull().default(''),
  provider: text().notNull().default('tmdb'),
});

export const listPages = sqliteTable(
  'list_pages',
  {
    slug: text().notNull(),
    page: integer().notNull(),
    language: text().notNull(),
    itemsJson: text('items_json').notNull(),
    totalPages: integer('total_pages').notNull(),
    totalItems: integer('total_items').notNull(),
    fetchedAt: integer('fetched_at').notNull(),
  },
  table => [primaryKey({ columns: [table.slug, table.page, table.language] })]
);

export const syncState = sqliteTable('sync_state', {
  name: text().primaryKey(),
  lastSync: integer('last_sync'),
});
