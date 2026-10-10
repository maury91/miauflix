import { z } from 'zod';

export const LIST_CAPABILITY = 'lists' as const;
export const LIST_CAPABILITY_VERSION = 1 as const;

export const listScopeSchema = z.enum(['public', 'personal']);
export const listServiceDefinitionSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string(),
  description: z.string(),
  provider: z.string().min(1),
  scope: listScopeSchema,
  requiresConnection: z.boolean(),
  rank: z.number().int().nonnegative().optional(),
});

export const listServiceDefinitionsPageSchema = z.object({
  results: z.array(listServiceDefinitionSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  totalItems: z.number().int().nonnegative(),
});

export const externalMediaIdsSchema = z
  .object({
    trakt: z.number().int().positive().optional(),
    tmdb: z.number().int().positive().optional(),
    imdb: z
      .string()
      .regex(/^tt\d+$/)
      .optional(),
  })
  .refine(ids => ids.trakt !== undefined || ids.tmdb !== undefined || ids.imdb !== undefined, {
    message: 'At least one external media id is required',
  });

export const externalMediaRefSchema = z.object({
  mediaType: z.enum(['movie', 'tv']),
  ids: externalMediaIdsSchema,
});

export const listItemSchema = z.object({
  key: z.string().min(1),
  rank: z.number().int().nonnegative(),
  media: externalMediaRefSchema,
});

export const listServicePageSchema = z.object({
  listId: z.string().min(1),
  page: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  totalItems: z.number().int().nonnegative(),
  items: z.array(listItemSchema),
});

export const providerAuthorizationSchema = z.object({
  authorizationId: z.string().min(1),
  verificationUrl: z.string().url(),
  userCode: z.string().min(1),
  expiresAt: z.string().datetime(),
  interval: z.number().int().positive(),
});

export const providerAssociationSchema = z.object({
  connected: z.boolean(),
  provider: z.string().min(1),
  accountId: z.string().nullable(),
  username: z.string().nullable(),
});

export const connectionResultSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('pending') }),
  z.object({ state: z.literal('connected'), association: providerAssociationSchema }),
  z.object({ state: z.enum(['denied', 'expired', 'invalid']) }),
]);

export const listStatusDetailsSchema = z.object({
  provider: z.string(),
  connectedAccounts: z.number().int().nonnegative(),
  cachedLists: z.number().int().nonnegative(),
});

export type ListServiceDefinition = z.infer<typeof listServiceDefinitionSchema>;
export type ListServiceDefinitionsPage = z.infer<typeof listServiceDefinitionsPageSchema>;
export type ExternalMediaRef = z.infer<typeof externalMediaRefSchema>;
export type ListItem = z.infer<typeof listItemSchema>;
export type ListServicePage = z.infer<typeof listServicePageSchema>;
export type ProviderAuthorization = z.infer<typeof providerAuthorizationSchema>;
export type ProviderAssociation = z.infer<typeof providerAssociationSchema>;
export type ConnectionResult = z.infer<typeof connectionResultSchema>;
export type ListStatusDetails = z.infer<typeof listStatusDetailsSchema>;

export const playbackRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('movie'), mediaId: z.number().int().positive() }),
  z.object({
    kind: z.literal('episode'),
    showMediaId: z.number().int().positive(),
    seasonNumber: z.number().int().nonnegative(),
    episodeNumber: z.number().int().positive(),
  }),
]);
export const playbackProgressSchema = z
  .object({
    playable: playbackRefSchema,
    positionSeconds: z.number().finite().nonnegative(),
    durationSeconds: z.number().finite().positive(),
    state: z.enum(['playing', 'paused', 'completed']),
  })
  .refine(value => value.positionSeconds <= value.durationSeconds, {
    message: 'Position cannot exceed duration',
  });
export const playbackEntrySchema = playbackProgressSchema.safeExtend({
  updatedAt: z.string().datetime({ offset: true }),
  nextEpisode: z.literal(true).optional(),
});
export const playbackSnapshotSchema = z.object({ progress: z.array(playbackEntrySchema) });
export const playbackSyncSchema = playbackProgressSchema.safeExtend({
  subjectId: z.string().min(1),
});
export type PlaybackProgress = z.infer<typeof playbackProgressSchema>;
export type PlaybackEntry = z.infer<typeof playbackEntrySchema>;
