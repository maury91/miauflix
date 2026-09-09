import { integer } from 'drizzle-orm/sqlite-core';

export const timestamps = {
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
};
