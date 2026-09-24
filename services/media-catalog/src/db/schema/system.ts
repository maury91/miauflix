import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const apiCache = sqliteTable(
  'api_cache',
  {
    key: text().primaryKey(),
    value: text().notNull(),
    expiresAt: integer('expires_at').notNull(),
    staleUntil: integer('stale_until').notNull(),
  },
  table => [
    index('api_cache_expiry').on(table.expiresAt),
    index('api_cache_stale').on(table.staleUntil),
  ]
);

export const meta = sqliteTable('meta', { key: text().primaryKey(), value: text().notNull() });

export const syncState = sqliteTable('sync_state', {
  name: text().primaryKey(),
  lastSync: integer('last_sync'),
});
