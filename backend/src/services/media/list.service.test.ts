jest.mock('@database/database');

import { configureFakerSeed } from '@__test-utils__/utils';

import { Database } from '@database/database';
import type { MediaListRepository } from '@repositories/mediaList.repository';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';
import type { ListClientService } from '@services/list/list-client.service';

import { DEFAULT_LIST_REFRESH_PAGES, ListService } from './list.service';

const publicDefinition = {
  id: 'trakt-movies-popular',
  slug: 'trakt-movies-popular',
  name: 'Popular Movies',
  description: '',
  provider: 'trakt',
  scope: 'public' as const,
  requiresConnection: false,
};

const setupTest = () => {
  const database = new Database({} as never) as jest.Mocked<Database>;
  const mediaListRepository = database.getMediaListRepository() as jest.Mocked<MediaListRepository>;
  const listClient = {
    getDefinitions: jest.fn().mockResolvedValue([publicDefinition]),
    getPage: jest.fn().mockResolvedValue({
      listId: publicDefinition.id,
      page: 1,
      totalPages: 1,
      totalItems: 0,
      items: [],
    }),
  } as unknown as jest.Mocked<ListClientService>;
  const catalogClient = {
    batch: jest.fn().mockResolvedValue({ items: [] }),
  } as unknown as jest.Mocked<CatalogClientService>;
  mediaListRepository.discardGeneration = jest.fn().mockResolvedValue(undefined);
  mediaListRepository.stagePage = jest.fn().mockResolvedValue(undefined);
  mediaListRepository.activateGeneration = jest.fn().mockResolvedValue(undefined);
  database.getMovieRepository().findListItemsByMediaIds = jest.fn().mockResolvedValue([]);
  database.getTVShowRepository().findListItemsByMediaIds = jest.fn().mockResolvedValue([]);
  return {
    database,
    mediaListRepository,
    listClient,
    catalogClient,
    service: new ListService(database, catalogClient, listClient),
  };
};

describe('ListService refresh safety', () => {
  beforeAll(() => {
    configureFakerSeed();
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('discards a failed generation without activating it', async () => {
    const { catalogClient, mediaListRepository, service } = setupTest();
    const mediaList = {
      id: 1,
      activeGeneration: 'previous-generation',
    } as never;

    catalogClient.batch.mockRejectedValueOnce(new Error('catalog unavailable'));
    mediaListRepository.findBySlug = jest.fn().mockResolvedValue(mediaList);

    await expect(service.refreshList('trakt-movies-popular', 1)).rejects.toThrow(
      'catalog unavailable'
    );
    expect(mediaListRepository.discardGeneration).toHaveBeenCalledWith(1, expect.any(String));
    expect(mediaListRepository.activateGeneration).not.toHaveBeenCalled();
  });

  it('hydrates every configured page for a personal list', async () => {
    const { listClient, mediaListRepository, service } = setupTest();
    const definition = {
      id: 'personal-list',
      slug: 'personal-list',
      name: 'Personal List',
      description: '',
      provider: 'trakt',
      scope: 'personal' as const,
      requiresConnection: true,
    };
    listClient.getDefinitions.mockResolvedValueOnce([definition]);
    listClient.getPage.mockImplementation(async (_subjectId, _slug, page) => ({
      listId: definition.id,
      page,
      totalPages: 2,
      totalItems: 0,
      items: [],
    }));
    mediaListRepository.findBySlug = jest
      .fn()
      .mockResolvedValue({ id: 1, activeGeneration: null } as never);

    await service.refreshList('personal-list', DEFAULT_LIST_REFRESH_PAGES, 'user-1');

    expect(listClient.getPage).toHaveBeenNthCalledWith(1, 'user-1', 'personal-list', 1);
    expect(listClient.getPage).toHaveBeenNthCalledWith(2, 'user-1', 'personal-list', 2);
    expect(mediaListRepository.activateGeneration).toHaveBeenCalledWith(1, expect.any(String));
  });
});
