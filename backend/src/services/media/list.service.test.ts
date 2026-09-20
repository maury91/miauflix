jest.mock('@database/database');

import { Database } from '@database/database';
import type { MediaListRepository } from '@repositories/mediaList.repository';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';
import type { ListClientService } from '@services/list/list-client.service';

import { DEFAULT_LIST_REFRESH_PAGES, ListService } from './list.service';

describe('ListService refresh safety', () => {
  it('discards a failed generation without activating it', async () => {
    const database = new Database({} as never) as jest.Mocked<Database>;
    const mediaListRepository =
      database.getMediaListRepository() as jest.Mocked<MediaListRepository>;
    const listClient = {
      getDefinitions: jest.fn().mockResolvedValue([
        {
          id: 'trakt-movies-popular',
          slug: 'trakt-movies-popular',
          name: 'Popular Movies',
          description: '',
          provider: 'trakt',
          scope: 'public',
          requiresConnection: false,
        },
      ]),
      getPage: jest.fn().mockResolvedValue({
        listId: 'trakt-movies-popular',
        page: 1,
        totalPages: 1,
        totalItems: 1,
        items: [{ key: 'movie-1', rank: 0, media: { mediaType: 'movie', ids: { tmdb: 1 } } }],
      }),
    } as unknown as jest.Mocked<ListClientService>;
    const catalogClient = {
      batch: jest.fn().mockRejectedValue(new Error('catalog unavailable')),
    } as unknown as jest.Mocked<CatalogClientService>;
    const mediaList = {
      id: 1,
      activeGeneration: 'previous-generation',
    } as never;

    mediaListRepository.findBySlug = jest.fn().mockResolvedValue(mediaList);
    mediaListRepository.discardGeneration = jest.fn().mockResolvedValue(undefined);
    mediaListRepository.stagePage = jest.fn().mockResolvedValue(undefined);
    mediaListRepository.activateGeneration = jest.fn().mockResolvedValue(undefined);

    const service = new ListService(database, catalogClient, listClient);

    await expect(service.refreshList('trakt-movies-popular', 1)).rejects.toThrow(
      'catalog unavailable'
    );
    expect(mediaListRepository.discardGeneration).toHaveBeenCalledWith(1, expect.any(String));
    expect(mediaListRepository.activateGeneration).not.toHaveBeenCalled();
  });

  it('hydrates the configured page window for a first personal-list read', async () => {
    const database = new Database({} as never) as jest.Mocked<Database>;
    const mediaListRepository =
      database.getMediaListRepository() as jest.Mocked<MediaListRepository>;
    const definition = {
      id: 'personal-list',
      slug: 'personal-list',
      name: 'Personal List',
      description: '',
      provider: 'trakt',
      scope: 'personal' as const,
      requiresConnection: true,
    };
    const listClient = {
      getDefinitions: jest.fn().mockResolvedValue([definition]),
    } as unknown as jest.Mocked<ListClientService>;
    const catalogClient = {
      batch: jest.fn().mockResolvedValue({ items: [] }),
    } as unknown as jest.Mocked<CatalogClientService>;
    const activeList = { id: 1, activeGeneration: 'generation-1' } as never;
    mediaListRepository.findBySlug = jest
      .fn()
      .mockResolvedValueOnce({ id: 1, activeGeneration: null } as never)
      .mockResolvedValueOnce(activeList);
    mediaListRepository.getPage = jest.fn().mockResolvedValue([]);
    mediaListRepository.countItems = jest.fn().mockResolvedValue(0);
    database.getMovieRepository().findListItemsByMediaIds = jest.fn().mockResolvedValue([]);
    database.getTVShowRepository().findListItemsByMediaIds = jest.fn().mockResolvedValue([]);

    const service = new ListService(database, catalogClient, listClient);
    const refreshList = jest.spyOn(service, 'refreshList').mockResolvedValue(undefined);

    await service.getListPage('personal-list', 'en', 0, 20, 'user-1');

    expect(refreshList).toHaveBeenCalledWith('personal-list', DEFAULT_LIST_REFRESH_PAGES, 'user-1');
  });
});
