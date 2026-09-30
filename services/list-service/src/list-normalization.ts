import { externalMediaRefSchema } from '@miauflix/service-contracts';
import { z } from 'zod';

export type TraktIds = { trakt?: number | null; tmdb?: number | null; imdb?: string | null };
export type TraktItem = { movie?: { ids: TraktIds }; show?: { ids: TraktIds }; type?: string };

const traktIdsSchema = z.object({
  trakt: z.number().int().positive().nullable().optional(),
  tmdb: z.number().int().positive().nullable().optional(),
  imdb: z
    .string()
    .regex(/^tt\d+$/)
    .nullable()
    .optional(),
});
const bareTraktItemSchema = z.object({ ids: traktIdsSchema });
const nestedMovieItemSchema = z.object({ movie: bareTraktItemSchema });
const nestedShowItemSchema = z.object({ show: bareTraktItemSchema });
const mixedItemSchema = z.union([nestedMovieItemSchema, nestedShowItemSchema]);

export const normalizeListItems = (
  items: unknown[],
  mediaType: 'movie' | 'tv',
  bare: boolean
): TraktItem[] => {
  if (bare) {
    const mediaKey = mediaType === 'movie' ? 'movie' : 'show';
    return z
      .array(bareTraktItemSchema)
      .parse(items)
      .map(item => ({ [mediaKey]: item }));
  }
  return z.array(mediaType === 'movie' ? nestedMovieItemSchema : nestedShowItemSchema).parse(items);
};

export const mapItems = (items: TraktItem[], mediaType: 'movie' | 'tv') =>
  dedupeMappedItems(
    items.flatMap((item, index) => {
      const media = mediaType === 'movie' ? item.movie : item.show;
      if (!media?.ids) return [];
      const ids = media.ids;
      const normalizedIds = Object.fromEntries(
        Object.entries(ids).filter(([, value]) => value !== null && value !== undefined)
      );
      return [
        {
          key: `trakt:${mediaType}:${ids.trakt ?? index}`,
          rank: index,
          media: externalMediaRefSchema.parse({ mediaType, ids: normalizedIds }),
        },
      ];
    })
  );

export const normalizeMixedListItems = (items: unknown[]): TraktItem[] =>
  z.array(mixedItemSchema).parse(items);

export const mapMixedItems = (items: TraktItem[]) =>
  dedupeMappedItems(
    items.flatMap((item, index) => {
      const mediaType = item.movie ? 'movie' : item.show ? 'tv' : null;
      const media = item.movie ?? item.show;
      if (!mediaType || !media?.ids) return [];
      const ids = media.ids;
      const normalizedIds = Object.fromEntries(
        Object.entries(ids).filter(([, value]) => value !== null && value !== undefined)
      );
      return [
        {
          key: `trakt:${mediaType}:${ids.trakt ?? index}`,
          rank: index,
          media: externalMediaRefSchema.parse({ mediaType, ids: normalizedIds }),
        },
      ];
    })
  );

type MappedListItem = {
  key: string;
  rank: number;
  media: ReturnType<typeof externalMediaRefSchema.parse>;
};

/** Keep the first provider item for each media identity and compact its rank. */
const dedupeMappedItems = (items: MappedListItem[]): MappedListItem[] => {
  const seen = new Set<string>();
  const unique: MappedListItem[] = [];

  for (const item of items) {
    const identityKeys = Object.entries(item.media.ids)
      .filter(([, value]) => value !== undefined)
      .map(([kind, value]) => `${item.media.mediaType}:${kind}:${value}`);
    if (identityKeys.some(key => seen.has(key))) continue;
    identityKeys.forEach(key => seen.add(key));
    unique.push({ ...item, rank: unique.length });
  }

  return unique;
};
