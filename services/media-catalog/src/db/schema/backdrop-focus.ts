import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const backdropFocus = sqliteTable(
  'backdrop_focus',
  {
    provider: text().notNull(),
    imageKey: text('image_key').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    state: text().notNull(),
    focusX: real('focus_x'),
    focusY: real('focus_y'),
    analyzedAt: integer('analyzed_at').notNull(),
    retryAfter: integer('retry_after'),
    errorCode: text('error_code'),
  },
  table => [
    primaryKey({ columns: [table.provider, table.imageKey, table.algorithmVersion] }),
    index('backdrop_focus_retry').on(table.retryAfter),
  ]
);

export type BackdropFocusRecord = typeof backdropFocus.$inferSelect;
