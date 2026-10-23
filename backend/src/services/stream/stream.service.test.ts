jest.mock('@logger');

import { createMockContentSource, createMockMovie } from '@__test-utils__/mocks/movie.mock';
import { configureFakerSeed } from '@__test-utils__/utils';
import { Quality } from '@miauflix/source-metadata-extractor';

import type { Database } from '@database/database';
import type { DownloadService } from '@services/download/download.service';
import type { MediaService } from '@services/media/media.service';
import type { PlaybackTarget } from '@services/playback/playback-target';
import type { PlaybackTargetService } from '@services/playback/playback-target.service';
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
    const service = new StreamService(
      database,
      sourceService,
      {} as DownloadService,
      mediaService,
      {} as PlaybackTargetService
    );

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

describe('StreamService.resolvePlaybackTarget', () => {
  const setupTest = () => {
    const movie = createMockMovie();
    const contentSource = createMockContentSource();
    const repository = {
      findById: jest.fn().mockResolvedValue(contentSource),
      isLinkedToMovie: jest.fn().mockResolvedValue(true),
    };
    const episodeSources = { findForPlayback: jest.fn().mockResolvedValue(null) };
    const database = {
      getContentSourceRepository: jest.fn().mockReturnValue(repository),
      getEpisodeSourceRepository: jest.fn().mockReturnValue(episodeSources),
    } as unknown as Database;
    const mediaService = {
      getLocalMovieByMediaId: jest.fn().mockResolvedValue(movie),
    } as unknown as jest.Mocked<MediaService>;
    const movieTarget: PlaybackTarget = {
      source: contentSource,
      filePath: 'Movie.2020.mkv',
      matchKind: 'movie',
    };
    const targets = {
      forMovie: jest.fn().mockResolvedValue(movieTarget),
      forEpisode: jest.fn(
        async (match: {
          source: typeof contentSource;
          videoFilePath: string;
          matchKind: 'combined' | 'single';
        }) => ({ source: match.source, filePath: match.videoFilePath, matchKind: match.matchKind })
      ),
    };
    const service = new StreamService(
      database,
      {} as SourceService,
      {} as DownloadService,
      mediaService,
      targets
    );
    const grant = {
      sourceId: contentSource.id,
      playableKind: 'movie' as const,
      playableKey: `m:${movie.mediaId}`,
    };
    return {
      movie,
      contentSource,
      repository,
      episodeSources,
      mediaService,
      movieTarget,
      targets,
      service,
      grant,
    };
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

  it('resolves a movie grant to the main video of a linked source', async () => {
    const { movie, contentSource, repository, mediaService, movieTarget, targets, service, grant } =
      setupTest();

    await expect(service.resolvePlaybackTarget(grant)).resolves.toEqual({
      target: movieTarget,
      movie,
    });
    expect(mediaService.getLocalMovieByMediaId).toHaveBeenCalledWith(movie.mediaId);
    expect(repository.isLinkedToMovie).toHaveBeenCalledWith(movie.id, contentSource.id);
    expect(targets.forMovie).toHaveBeenCalledWith(movie.id, contentSource);
  });

  it('resolves an episode grant to its matched file', async () => {
    const { contentSource, episodeSources, service } = setupTest();
    episodeSources.findForPlayback.mockResolvedValue({
      videoFilePath: 'Show.S01E02.mkv',
      matchKind: 'single',
      source: contentSource,
    });

    await expect(
      service.resolvePlaybackTarget({
        sourceId: contentSource.id,
        playableKind: 'episode',
        playableKey: 'e:42:1:2',
      })
    ).resolves.toEqual({
      target: { source: contentSource, filePath: 'Show.S01E02.mkv', matchKind: 'single' },
      movie: null,
    });
    expect(episodeSources.findForPlayback).toHaveBeenCalledWith(42, 1, 2, contentSource.id);
  });

  it('rejects a movie grant for a source that belongs to another movie', async () => {
    const { repository, targets, service, grant } = setupTest();
    repository.isLinkedToMovie.mockResolvedValue(false);

    await expect(service.resolvePlaybackTarget(grant)).resolves.toBeNull();
    expect(targets.forMovie).not.toHaveBeenCalled();
  });

  it('rejects a movie grant when the movie is not mirrored locally', async () => {
    const { repository, mediaService, service, grant } = setupTest();
    mediaService.getLocalMovieByMediaId.mockResolvedValue(null);

    await expect(service.resolvePlaybackTarget(grant)).resolves.toBeNull();
    expect(repository.isLinkedToMovie).not.toHaveBeenCalled();
  });
});
