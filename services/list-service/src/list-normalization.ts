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

export const normalizeListItems = (
  items: unknown[],
  mediaType: 'movie' | 'tv',
  bare: boolean
): TraktItem[] => {
  if (bare) {
    return z
      .array(bareTraktItemSchema)
      .parse(items)
      .map(item => ({ [mediaType]: item }));
  }
  return z.array(mediaType === 'movie' ? nestedMovieItemSchema : nestedShowItemSchema).parse(items);
};

export const mapItems = (items: TraktItem[], mediaType: 'movie' | 'tv') =>
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
  });
