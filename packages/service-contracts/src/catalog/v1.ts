import { z } from 'zod';

export const CATALOG_CAPABILITY = 'catalog' as const;
export const CATALOG_CAPABILITY_VERSION = 1 as const;
export const BASE_PATH = '/v1/catalog' as const;

export const mediaTypeSchema = z.enum(['movie', 'tv']);
export const mediaRefSchema = z.object({
  mediaType: mediaTypeSchema,
  mediaId: z.number().int().positive(),
});
export const localizedGenreSchema = z.object({ id: z.number().int(), name: z.string() });

export const movieDetailSchema = mediaRefSchema.extend({
  mediaType: z.literal('movie'),
  imdbId: z.string().nullable(),
  title: z.string(),
  overview: z.string(),
  tagline: z.string(),
  releaseDate: z.string(),
  runtime: z.number(),
  poster: z.string(),
  backdrop: z.string(),
  logo: z.string(),
  genres: z.array(localizedGenreSchema),
  popularity: z.number(),
  rating: z.number(),
  detailsSyncedAt: z.string().nullable(),
});

export const seasonSummarySchema = z.object({
  mediaId: z.number().int().positive(),
  seasonNumber: z.number().int().nonnegative(),
  name: z.string(),
  overview: z.string(),
  airDate: z.string().nullable(),
  poster: z.string().nullable(),
  episodeCount: z.number().int().nonnegative(),
  synced: z.boolean(),
});

export const tvShowDetailSchema = mediaRefSchema.extend({
  mediaType: z.literal('tv'),
  imdbId: z.string().nullable(),
  name: z.string(),
  overview: z.string(),
  tagline: z.string(),
  firstAirDate: z.string(),
  status: z.string(),
  type: z.string(),
  inProduction: z.boolean(),
  episodeRunTime: z.array(z.number()),
  poster: z.string(),
  backdrop: z.string(),
  logo: z.string(),
  genres: z.array(localizedGenreSchema),
  popularity: z.number(),
  rating: z.number(),
  seasons: z.array(seasonSummarySchema),
  detailsSyncedAt: z.string().nullable(),
});

export const episodeDetailSchema = z.object({
  mediaId: z.number().int().positive(),
  episodeNumber: z.number().int().positive(),
  name: z.string(),
  overview: z.string(),
  airDate: z.string().nullable(),
  still: z.string().nullable(),
});

export const seasonDetailSchema = z.object({
  tvMediaId: z.number().int().positive(),
  seasonMediaId: z.number().int().positive(),
  seasonNumber: z.number().int().nonnegative(),
  name: z.string(),
  overview: z.string(),
  airDate: z.string().nullable(),
  poster: z.string().nullable(),
  synced: z.boolean(),
  episodes: z.array(episodeDetailSchema),
});

export const mediaSummarySchema = z.object({
  mediaType: mediaTypeSchema,
  mediaId: z.number().int().positive(),
  title: z.string(),
  overview: z.string(),
  poster: z.string(),
  backdrop: z.string(),
  genreIds: z.array(z.number().int()),
  releaseDate: z.string(),
  popularity: z.number(),
  rating: z.number(),
});
export const externalMediaLookupSchema = z.object({
  mediaType: mediaTypeSchema,
  ids: z
    .object({
      tmdb: z.number().int().positive().optional(),
      imdb: z
        .string()
        .regex(/^tt\d+$/)
        .optional(),
    })
    .refine(ids => ids.tmdb !== undefined || ids.imdb !== undefined),
});
export const externalMediaResolveRequestSchema = z.object({
  items: z.array(externalMediaLookupSchema).max(50),
});
export const externalMediaResolveResponseSchema = z.object({
  items: z.array(
    z.object({
      requested: externalMediaLookupSchema,
      media: mediaRefSchema.nullable(),
    })
  ),
});
export const batchRequestSchema = z.object({
  items: z.array(mediaRefSchema).max(50),
  language: z.string().default('en'),
});
export const batchErrorSchema = z.object({
  ref: mediaRefSchema,
  error: z.string(),
});
export const batchResponseSchema = z.object({
  items: z.array(z.discriminatedUnion('mediaType', [movieDetailSchema, tvShowDetailSchema])),
  missing: z.array(mediaRefSchema),
  errors: z.array(batchErrorSchema).default([]),
});
export const watchingRequestSchema = z.object({ mediaIds: z.array(z.number().int().positive()) });
export const okResponseSchema = z.object({ ok: z.literal(true) });
export const catalogStatusDetailsSchema = z.object({
  provider: z.string(),
  movies: z.number().int().nonnegative(),
  tvShows: z.number().int().nonnegative(),
  seasons: z.number().int().nonnegative(),
  episodes: z.number().int().nonnegative(),
  lastMovieSync: z.string().nullable(),
  lastShowSync: z.string().nullable(),
});

export const catalogReadModeSchema = z.enum([
  'cache-only',
  'stale-while-revalidate',
  'require-fresh',
]);
export const catalogWorkClassSchema = z.enum(['interactive', 'foreground', 'maintenance']);

export const mediaSummaryBatchRequestSchema = z.object({
  items: z.array(mediaRefSchema).max(50),
  language: z.string().min(2).max(16),
  mode: catalogReadModeSchema,
  workClass: catalogWorkClassSchema,
});

export const browseMediaSummarySchema = z.object({
  mediaType: mediaTypeSchema,
  mediaId: z.number().int().positive(),
  title: z.string(),
  overview: z.string(),
  poster: z.string(),
  backdrop: z.string(),
  logo: z.string(),
  genres: z.array(localizedGenreSchema),
  releaseDate: z.string(),
  runtime: z.number().optional(),
  popularity: z.number(),
  rating: z.number(),
  detailsSyncedAt: z.string().nullable(),
});

export const mediaSummaryBatchResponseSchema = z.object({
  items: z.array(browseMediaSummarySchema),
  pending: z.array(mediaRefSchema),
  missing: z.array(mediaRefSchema),
  errors: z.array(batchErrorSchema),
});

export type MediaType = z.infer<typeof mediaTypeSchema>;
export type MediaRef = z.infer<typeof mediaRefSchema>;
export type LocalizedGenre = z.infer<typeof localizedGenreSchema>;
export type MovieDetail = z.infer<typeof movieDetailSchema>;
export type SeasonSummary = z.infer<typeof seasonSummarySchema>;
export type TVShowDetail = z.infer<typeof tvShowDetailSchema>;
export type EpisodeDetail = z.infer<typeof episodeDetailSchema>;
export type SeasonDetail = z.infer<typeof seasonDetailSchema>;
export type MediaSummary = z.infer<typeof mediaSummarySchema>;
export type ExternalMediaLookup = z.infer<typeof externalMediaLookupSchema>;
export type ExternalMediaResolveRequest = z.infer<typeof externalMediaResolveRequestSchema>;
export type ExternalMediaResolveResponse = z.infer<typeof externalMediaResolveResponseSchema>;
export type BatchError = z.infer<typeof batchErrorSchema>;
export type BatchResponse = z.infer<typeof batchResponseSchema>;
export type CatalogStatusDetails = z.infer<typeof catalogStatusDetailsSchema>;
export type CatalogReadMode = z.infer<typeof catalogReadModeSchema>;
export type CatalogWorkClass = z.infer<typeof catalogWorkClassSchema>;
export type MediaSummaryBatchRequest = z.infer<typeof mediaSummaryBatchRequestSchema>;
export type BrowseMediaSummary = z.infer<typeof browseMediaSummarySchema>;
export type MediaSummaryBatchResponse = z.infer<typeof mediaSummaryBatchResponseSchema>;
