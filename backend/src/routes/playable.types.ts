import { z } from 'zod';

/** A catalog identity that can be handed to the playback pipeline. */
export const moviePlayableRefSchema = z
  .object({
    kind: z.literal('movie'),
    mediaId: z.number().int().positive(),
  })
  .strict();

export const episodePlayableRefSchema = z
  .object({
    kind: z.literal('episode'),
    showMediaId: z.number().int().positive(),
    seasonNumber: z.number().int().nonnegative(),
    episodeNumber: z.number().int().positive(),
  })
  .strict();

export const playableRefSchema = z.discriminatedUnion('kind', [
  moviePlayableRefSchema,
  episodePlayableRefSchema,
]);

export const showMediaRefSchema = z
  .object({
    kind: z.literal('show'),
    mediaId: z.number().int().positive(),
  })
  .strict();

export const mediaIntentRefSchema = z.discriminatedUnion('kind', [
  moviePlayableRefSchema,
  showMediaRefSchema,
  episodePlayableRefSchema,
]);

export const reachableIntentSchema = z
  .object({
    target: mediaIntentRefSchema,
    distance: z.union([z.literal(1), z.literal(2)]),
    direction: z.enum(['left', 'right', 'up', 'down', 'season', 'episode']),
  })
  .strict();

export const preloadIntentRequestSchema = z
  .object({
    sequence: z.number().int().nonnegative().safe(),
    view: z.enum(['browse', 'details', 'player']),
    focused: mediaIntentRefSchema.nullable(),
    reachable: z.array(reachableIntentSchema).max(8),
  })
  .strict();

export type MoviePlayableRef = z.infer<typeof moviePlayableRefSchema>;
export type EpisodePlayableRef = z.infer<typeof episodePlayableRefSchema>;
export type PlayableRef = z.infer<typeof playableRefSchema>;
export type MediaIntentRef = z.infer<typeof mediaIntentRefSchema>;
export type ReachableIntent = z.infer<typeof reachableIntentSchema>;
export type PreloadIntentRequest = z.infer<typeof preloadIntentRequestSchema>;

export type IntentLeaseKey = `${string}:${string}:${string}`;

/** Stable identity used for shared preparation and storage lookups. */
export function playableKey(ref: PlayableRef): string {
  if (ref.kind === 'movie') return `m:${ref.mediaId}`;
  return `e:${ref.showMediaId}:${ref.seasonNumber}:${ref.episodeNumber}`;
}

/** Parse only keys produced by {@link playableKey}. */
export function playableFromKey(key: string): PlayableRef | null {
  const movie = /^m:(\d+)$/.exec(key);
  if (movie) {
    const parsed = { kind: 'movie' as const, mediaId: Number(movie[1]) };
    return playableRefSchema.safeParse(parsed).success ? parsed : null;
  }

  const episode = /^e:(\d+):(\d+):(\d+)$/.exec(key);
  if (!episode) return null;

  const [, showMediaId, seasonNumber, episodeNumber] = episode;
  const parsed = {
    kind: 'episode' as const,
    showMediaId: Number(showMediaId),
    seasonNumber: Number(seasonNumber),
    episodeNumber: Number(episodeNumber),
  };
  return playableRefSchema.safeParse(parsed).success ? parsed : null;
}
