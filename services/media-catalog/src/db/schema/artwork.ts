import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Durable input, progress and selected artwork for one movie/show. */
export const mediaArtwork = sqliteTable(
  'media_artwork',
  {
    mediaType: text('media_type', { enum: ['movie', 'tv'] }).notNull(),
    mediaId: integer('media_id').notNull(),
    inputSignature: text('input_signature').notNull(),
    imageKey: text('image_key').notNull(),
    backdropUrl: text('backdrop_url').notNull(),
    displayBackdrop: text('display_backdrop').notNull(),
    candidates: text().notNull(),
    measurements: text().notNull().default('[]'),
    cursor: integer().notNull().default(0),
    popularity: real().notNull().default(0),
    priority: integer().notNull().default(0),
    status: text({ enum: ['pending', 'ready', 'failed'] })
      .notNull()
      .default('pending'),
    cardLogo: text('card_logo'),
    heroLogo: text('hero_logo'),
    cardComplete: integer('card_complete', { mode: 'boolean' }).notNull().default(false),
    heroComplete: integer('hero_complete', { mode: 'boolean' }).notNull().default(false),
    cardStatus: text('card_status', { enum: ['pending', 'ready', 'failed'] }).notNull(),
    heroStatus: text('hero_status', { enum: ['pending', 'ready', 'failed'] }).notNull(),
    revision: integer().notNull().default(1),
    attempts: integer().notNull().default(0),
    retryAfter: integer('retry_after'),
    queuedAt: integer('queued_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  table => [
    primaryKey({ columns: [table.mediaType, table.mediaId] }),
    index('media_artwork_queue').on(table.retryAfter, table.queuedAt),
  ]
);

/** Small, compressed 320×180 backdrop pixels shared by all logos on that backdrop. */
export const artworkBackdropCache = sqliteTable(
  'artwork_backdrop_cache',
  {
    imageKey: text('image_key').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    pixels: text().notNull(),
    luminance: text().notNull(),
    pixelBytes: integer('pixel_bytes').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  table => [primaryKey({ columns: [table.imageKey, table.algorithmVersion] })]
);

/** Reusable decoded PNG assets and transient failures, independent of backdrop. */
export const artworkLogoAssets = sqliteTable(
  'artwork_logo_assets',
  {
    assetUrl: text('asset_url').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    decodedPng: text('decoded_png'),
    width: integer(),
    height: integer(),
    failedAt: integer('failed_at'),
    updatedAt: integer('updated_at').notNull(),
  },
  table => [primaryKey({ columns: [table.assetUrl, table.algorithmVersion] })]
);

/** Reusable measurements for one PNG logo against one prepared backdrop. */
export const artworkLogoCache = sqliteTable(
  'artwork_logo_cache',
  {
    imageKey: text('image_key').notNull(),
    logoUrl: text('logo_url').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    cardPass: integer('card_pass', { mode: 'boolean' }),
    cardCoverage: real('card_coverage'),
    cardMedian: real('card_median'),
    heroPass: integer('hero_pass', { mode: 'boolean' }),
    heroCoverage: real('hero_coverage'),
    heroMedian: real('hero_median'),
    createdAt: integer('created_at').notNull(),
  },
  table => [primaryKey({ columns: [table.imageKey, table.logoUrl, table.algorithmVersion] })]
);
