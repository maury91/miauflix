import { createMockContentSource } from '@__test-utils__/mocks/movie.mock';
import { configureFakerSeed } from '@__test-utils__/utils';

import type { Database } from '@database/database';
import type { EncryptedStorageLayout } from '@entities/storage.entity';

import { PlaybackTargetService } from './playback-target.service';

const layout = (files: Array<[string, number]>): EncryptedStorageLayout => ({
  storeName: 'pack',
  filenameSalt: 'salt',
  pieceLength: 4,
  files: files.map(([path, length], index) => ({ path, length, offset: index * 100 })),
});

describe('PlaybackTargetService', () => {
  const setupTest = () => {
    const repository = {
      findMovieVideoFilePath: jest.fn().mockResolvedValue(null),
      setMovieVideoFilePath: jest.fn(
        async (_movieId: number, _sourceId: number, path: string) => path
      ),
    };
    const downloads = {
      resolveLayout: jest.fn().mockResolvedValue(
        layout([
          ['Movie/Sample.mkv', 10],
          ['Movie/Movie.2020.mkv', 900],
          ['Movie/Movie.2020.en.srt', 2],
        ])
      ),
    };
    const database = { getContentSourceRepository: () => repository } as unknown as Database;
    const service = new PlaybackTargetService(database, downloads);
    const source = createMockContentSource({ id: 5 });
    return { service, repository, downloads, source };
  };

  beforeAll(() => {
    configureFakerSeed();
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reuses the stored main video without loading the file list', async () => {
    const { service, repository, downloads, source } = setupTest();
    repository.findMovieVideoFilePath.mockResolvedValue('Movie/Movie.2020.mkv');

    await expect(service.forMovie(7, source)).resolves.toEqual({
      source,
      filePath: 'Movie/Movie.2020.mkv',
      matchKind: 'movie',
    });
    expect(downloads.resolveLayout).not.toHaveBeenCalled();
  });

  it('picks the largest video and stores it on the movie link', async () => {
    const { service, repository, source } = setupTest();

    const target = await service.forMovie(7, source);

    expect(target.filePath).toBe('Movie/Movie.2020.mkv');
    expect(repository.setMovieVideoFilePath).toHaveBeenCalledWith(7, 5, 'Movie/Movie.2020.mkv');
  });

  it('uses the path another resolution stored first', async () => {
    const { service, repository, source } = setupTest();
    repository.setMovieVideoFilePath.mockResolvedValue('Movie/Movie.2020.Directors.Cut.mkv');

    await expect(service.forMovie(7, source)).resolves.toMatchObject({
      filePath: 'Movie/Movie.2020.Directors.Cut.mkv',
    });
  });

  it('rejects a source without any video file', async () => {
    const { service, downloads, repository, source } = setupTest();
    downloads.resolveLayout.mockResolvedValue(layout([['readme.txt', 1]]));

    await expect(service.forMovie(7, source)).rejects.toThrow(
      'Source does not contain a video file'
    );
    expect(repository.setMovieVideoFilePath).not.toHaveBeenCalled();
  });

  it('maps episode matches and skips matches without a listed file', () => {
    const { service, source } = setupTest();

    expect(
      service.forEpisode({ source, videoFilePath: 'Show.S01E02.mkv', matchKind: 'combined' })
    ).toEqual({ source, filePath: 'Show.S01E02.mkv', matchKind: 'combined' });
    expect(service.forEpisode({ source, videoFilePath: null, matchKind: 'single' })).toBeNull();
  });
});
