import type { Database } from '@database/database';
import type { EpisodeLayout } from '@services/catalog/catalog.types';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';

import { EpisodeNumberingService } from './episode-numbering.service';

/** Show 7 is renumbered: TMDB S1E1-3 stay, S1E4-5 are AniList season 2. */
const LAYOUT: EpisodeLayout = {
  tvMediaId: 7,
  layout: 'anilist',
  version: 'v1',
  episodes: [1, 2, 3, 4, 5].map(n => ({
    mediaId: 70 + n,
    seasonNumber: n <= 3 ? 1 : 2,
    episodeNumber: n <= 3 ? n : n - 3,
    providerSeasonNumber: 1,
    providerEpisodeNumber: n,
  })),
};

const setupTest = () => {
  const versions = new Map<number, string | null>([
    [7, 'v1'],
    [8, null],
  ]);
  const findOne = jest.fn(({ where }: { where: { mediaId: number } }) =>
    Promise.resolve(
      versions.has(where.mediaId) ? { seasonLayoutVersion: versions.get(where.mediaId) } : null
    )
  );
  const db = { getRepository: () => ({ findOne }) } as unknown as Database;
  const catalogClient = { getEpisodeLayout: jest.fn().mockResolvedValue(LAYOUT) };
  const service = new EpisodeNumberingService(db, catalogClient as unknown as CatalogClientService);
  return { service, catalogClient };
};

const episode = (showMediaId: number, seasonNumber: number, episodeNumber: number) => ({
  kind: 'episode' as const,
  showMediaId,
  seasonNumber,
  episodeNumber,
});

describe('EpisodeNumberingService', () => {
  it('translates a renumbered show both ways and reads its layout once', async () => {
    const { service, catalogClient } = setupTest();

    await expect(service.toProvider(episode(7, 2, 1))).resolves.toEqual(episode(7, 1, 4));
    await expect(service.fromProvider(episode(7, 1, 5))).resolves.toEqual(episode(7, 2, 2));
    await expect(service.fromProvider(episode(7, 0, 1))).resolves.toEqual(episode(7, 0, 1));
    expect(catalogClient.getEpisodeLayout).toHaveBeenCalledTimes(1);
  });

  it('drops imported episodes it cannot place and rejects unknown exports', async () => {
    const { service } = setupTest();

    await expect(service.fromProvider(episode(7, 1, 9))).resolves.toBeNull();
    await expect(service.toProvider(episode(7, 3, 1))).rejects.toThrow('no toProvider numbering');
  });

  it('passes movies and shows on TMDB seasons through without a catalog call', async () => {
    const { service, catalogClient } = setupTest();
    const movie = { kind: 'movie' as const, mediaId: 7 };

    await expect(service.toProvider(movie)).resolves.toBe(movie);
    await expect(service.toProvider(episode(8, 1, 4))).resolves.toEqual(episode(8, 1, 4));
    await expect(service.fromProvider(episode(9, 1, 4))).resolves.toEqual(episode(9, 1, 4));
    expect(catalogClient.getEpisodeLayout).not.toHaveBeenCalled();
  });
});
