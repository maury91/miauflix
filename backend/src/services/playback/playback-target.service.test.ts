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
    const episodeRepository = {
      setVideoFilePath: jest.fn(async (_id: number, _old: string, path: string) => path),
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
    const database = {
      getContentSourceRepository: () => repository,
      getEpisodeSourceRepository: () => episodeRepository,
    } as unknown as Database;
    const sourceHealth = { markFailed: jest.fn() };
    const service = new PlaybackTargetService(database, downloads, sourceHealth);
    const source = createMockContentSource({ id: 5 });
    return { service, repository, episodeRepository, downloads, source, sourceHealth };
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

  it('rejects and reports a source without any video file', async () => {
    const { service, downloads, repository, source, sourceHealth } = setupTest();
    downloads.resolveLayout.mockResolvedValue(layout([['readme.txt', 1]]));

    await expect(service.forMovie(7, source)).rejects.toThrow(
      'Source does not contain a video file'
    );
    expect(repository.setMovieVideoFilePath).not.toHaveBeenCalled();
    expect(sourceHealth.markFailed).toHaveBeenCalledWith(5);
  });

  it('resolves a unique episode suffix and persists its canonical path', async () => {
    const { service, source, downloads, episodeRepository } = setupTest();
    downloads.resolveLayout.mockResolvedValue(layout([['Pack/Show.S01E02.mkv', 900]]));
    await expect(
      service.forEpisode({ id: 3, source, videoFilePath: 'Show.S01E02.mkv', matchKind: 'single' })
    ).resolves.toMatchObject({ filePath: 'Pack/Show.S01E02.mkv' });
    expect(episodeRepository.setVideoFilePath).toHaveBeenCalledWith(
      3,
      'Show.S01E02.mkv',
      'Pack/Show.S01E02.mkv'
    );
    await expect(
      service.forEpisode({ source, videoFilePath: null, matchKind: 'single' })
    ).resolves.toBeNull();
  });

  it('prefers an exact episode path over suffix matches', async () => {
    const { service, source, downloads } = setupTest();
    downloads.resolveLayout.mockResolvedValue(
      layout([
        ['episode.mkv', 900],
        ['Pack/episode.mkv', 900],
      ])
    );
    await expect(
      service.forEpisode({ source, videoFilePath: 'episode.mkv', matchKind: 'single' })
    ).resolves.toMatchObject({ filePath: 'episode.mkv' });
  });

  it('rejects ambiguous episode suffixes', async () => {
    const { service, source, downloads } = setupTest();
    downloads.resolveLayout.mockResolvedValue(
      layout([
        ['A/episode.mkv', 900],
        ['B/episode.mkv', 900],
      ])
    );
    await expect(
      service.forEpisode({ source, videoFilePath: 'episode.mkv', matchKind: 'single' })
    ).rejects.toMatchObject({ status: 'source_file_unavailable' });
  });
});
