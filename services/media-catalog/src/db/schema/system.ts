import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const apiCache = sqliteTable(
  'api_cache',
  { key: text().primaryKey(), value: text().notNull(), expiresAt: integer('expires_at').notNull() },
  table => [index('api_cache_expiry').on(table.expiresAt)]
);

export const meta = sqliteTable('meta', { key: text().primaryKey(), value: text().notNull() });
