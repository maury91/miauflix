jest.mock('@logger');

import { createMockContentSource, createMockMovie } from '@__test-utils__/mocks/movie.mock';
import { configureFakerSeed } from '@__test-utils__/utils';
import { Quality } from '@miauflix/source-metadata-extractor';

import type { Database } from '@database/database';
import type { DownloadService } from '@services/download/download.service';
import type { MediaService } from '@services/media/media.service';
import type { SourceService } from '@services/source/source.service';

import { StreamService } from './stream.service';

describe('StreamService immediate source readiness', () => {
  const setupTest = () => {
    const movie = createMockMovie();
    const pending = createMockContentSource({ file: undefined });
    const ready = createMockContentSource({
      ...pending,
      file: Buffer.from('torrent'),
      quality: Quality.FHD,
    });
    const repository = { findById: jest.fn() };
    const database = {
      getContentSourceRepository: jest.fn().mockReturnValue(repository),
      getEpisodeSourceRepository: jest.fn().mockReturnValue({ findForPlayback: jest.fn() }),
    } as unknown as Database;
    const sourceService = {
      getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([pending]),
      getSourcesForMovie: jest.fn().mockResolvedValue([ready]),
      processSourceMetadata: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SourceService>;
    const mediaService = {
      getMovieById: jest.fn().mockResolvedValue(movie),
    } as unknown as jest.Mocked<MediaService>;
    const service = new StreamService(database, sourceService, {} as DownloadService, mediaService);

    return { movie, pending, ready, service, sourceService };
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

  it('resolves source metadata inline instead of waiting for a queue worker', async () => {
    const { movie, pending, ready, service, sourceService } = setupTest();

    await expect(service.getBestSourceForStreaming(movie.id, 'auto')).resolves.toEqual(ready);
    expect(sourceService.processSourceMetadata).toHaveBeenCalledWith(pending.id);
  });
});

describe('StreamService.resolvePlaybackSource', () => {
  const setupTest = () => {
    const movie = createMockMovie();
    const contentSource = createMockContentSource();
    const repository = {
      findById: jest.fn().mockResolvedValue(contentSource),
      isLinkedToMovie: jest.fn().mockResolvedValue(true),
    };
    const database = {
      getContentSourceRepository: jest.fn().mockReturnValue(repository),
      getEpisodeSourceRepository: jest.fn().mockReturnValue({ findForPlayback: jest.fn() }),
    } as unknown as Database;
    const mediaService = {
      getLocalMovieByMediaId: jest.fn().mockResolvedValue(movie),
    } as unknown as jest.Mocked<MediaService>;
    const service = new StreamService(
      database,
      {} as SourceService,
      {} as DownloadService,
      mediaService
    );
    const grant = {
      sourceId: contentSource.id,
      playableKind: 'movie' as const,
      playableKey: `m:${movie.mediaId}`,
    };
    return { movie, contentSource, repository, mediaService, service, grant };
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

  it('resolves a movie grant whose source is linked to that movie', async () => {
    const { movie, contentSource, repository, mediaService, service, grant } = setupTest();

    await expect(service.resolvePlaybackSource(grant)).resolves.toEqual({
      source: contentSource,
      episodeSource: null,
      movie,
    });
    expect(mediaService.getLocalMovieByMediaId).toHaveBeenCalledWith(movie.mediaId);
    expect(repository.isLinkedToMovie).toHaveBeenCalledWith(movie.id, contentSource.id);
  });

  it('rejects a movie grant for a source that belongs to another movie', async () => {
    const { repository, service, grant } = setupTest();
    repository.isLinkedToMovie.mockResolvedValue(false);

    await expect(service.resolvePlaybackSource(grant)).resolves.toBeNull();
  });

  it('rejects a movie grant when the movie is not mirrored locally', async () => {
    const { repository, mediaService, service, grant } = setupTest();
    mediaService.getLocalMovieByMediaId.mockResolvedValue(null);

    await expect(service.resolvePlaybackSource(grant)).resolves.toBeNull();
    expect(repository.isLinkedToMovie).not.toHaveBeenCalled();
  });
});
