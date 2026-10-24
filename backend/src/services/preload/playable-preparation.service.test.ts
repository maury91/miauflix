import { Quality, Source, VideoCodec } from '@miauflix/source-metadata-extractor';

import type { PlayableRef } from '@routes/playable.types';
import { SourceHealthService } from '@services/source/source-health.service';

import { PlayablePreparationService } from './playable-preparation.service';

/** Movies play their main video; tests only need a stable path per source. */
const movieTargets = {
  forMovie: jest.fn(async (_movieId: number, source: unknown) => ({
    source,
    filePath: 'movie.mkv',
    matchKind: 'movie',
  })),
};
const movieTarget = (source: unknown) =>
  expect.objectContaining({ source, filePath: 'movie.mkv', matchKind: 'movie' });

describe('PlayablePreparationService', () => {
  it.each([
    { videoCompletedAt: new Date(), downloaded: 8000 },
    { localOnly: true, downloaded: 10000 },
    { downloaded: 10000 },
  ])('reuses completed storage before higher-ranked torrents (%j)', async completion => {
    const downloaded = { id: 1, quality: Quality.HD, streamingScore: 1, file: null };
    const fresh = {
      id: 2,
      quality: Quality.FHD,
      streamingScore: 100,
      file: Buffer.from('torrent'),
    };
    const mediaService = {
      getMovieByMediaId: jest.fn().mockResolvedValue({ local: { id: 7 } }),
    };
    const sourceService = {
      getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([fresh, downloaded]),
      processSourceMetadata: jest.fn(),
    };
    const storageService = {
      getStorageBySource: jest.fn(async (id: number) => (id === 1 ? completion : null)),
    };
    const warmup = { warm: jest.fn().mockResolvedValue({ state: 'ready' }) };
    const service = new PlayablePreparationService(
      mediaService as never,
      sourceService as never,
      warmup as never,
      storageService as never,
      movieTargets as never
    );
    for (const through of ['sources', 'warm'] as const) {
      const result = await service.prepare(
        { kind: 'movie', mediaId: 42 },
        {
          through,
          preferences: { quality: Quality.FHD, allowHevc: false },
          workClass: 'interactive',
        }
      );
      expect(result.source).toBe(downloaded);
    }
    expect(warmup.warm).toHaveBeenCalledWith(movieTarget(downloaded), 'm:42', 'm:42', {});
    expect(sourceService.processSourceMetadata).not.toHaveBeenCalled();
  });

  it('warms where a resume will start', async () => {
    const source = { id: 1, quality: Quality.HD, streamingScore: 1, file: null };
    const warmup = { warm: jest.fn().mockResolvedValue({ state: 'warming' }) };
    const service = new PlayablePreparationService(
      { getMovieByMediaId: jest.fn().mockResolvedValue({ local: { id: 7 } }) } as never,
      {
        getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([source]),
        processSourceMetadata: jest.fn(),
      } as never,
      warmup as never,
      { getStorageBySource: jest.fn().mockResolvedValue({ downloaded: 10000 }) } as never,
      movieTargets as never
    );

    await service.prepare(
      { kind: 'movie', mediaId: 42 },
      {
        through: 'warm',
        preferences: { quality: Quality.HD, allowHevc: false },
        workClass: 'background',
        resumeFraction: 0.4,
      }
    );

    expect(warmup.warm).toHaveBeenCalledWith(movieTarget(source), 'm:42', 'm:42', {
      startFraction: 0.4,
    });
  });

  it.each([
    { downloaded: 9999, videoCodec: null },
    { downloaded: 10000, videoCodec: VideoCodec.X265 },
  ])('does not prefer incomplete or incompatible downloads (%j)', async cached => {
    const downloaded = {
      id: 1,
      quality: Quality.HD,
      streamingScore: 1,
      file: Buffer.from('torrent'),
      videoCodec: cached.videoCodec,
    };
    const fresh = {
      id: 2,
      quality: Quality.FHD,
      streamingScore: 100,
      file: Buffer.from('torrent'),
    };
    const service = new PlayablePreparationService(
      { getMovieByMediaId: jest.fn().mockResolvedValue({ local: { id: 7 } }) } as never,
      {
        getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([fresh, downloaded]),
      } as never,
      undefined,
      {
        getStorageBySource: jest.fn(async (id: number) => (id === 1 ? cached : null)),
      } as never
    );
    const result = await service.prepare(
      { kind: 'movie', mediaId: 42 },
      {
        through: 'sources',
        preferences: { quality: 'auto', allowHevc: false },
        workClass: 'interactive',
      }
    );
    expect(result.source).toBe(fresh);
  });

  it('discovers source metadata for browse without starting torrent work', async () => {
    const source = {
      id: 11,
      file: Buffer.from('torrent'),
      hash: 'a'.repeat(40),
      magnetLink: 'magnet:?xt=urn:btih:browse',
      quality: Quality.FHD,
      sourceType: Source.WEB,
      videoCodec: null,
      streamingScore: 12,
    };
    const mediaService = {
      getMovieByMediaId: jest.fn().mockResolvedValue({
        local: {
          id: 7,
          mediaId: 42,
          imdbId: 'tt0000001',
          title: 'Test Movie',
          contentDirectoriesSearched: [],
        },
      }),
    };
    const sourceService = {
      getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([source]),
      processSourceMetadata: jest.fn(),
      getSourcesForMovie: jest.fn(),
    };
    const warmup = { warm: jest.fn() };
    const service = new PlayablePreparationService(
      mediaService as never,
      sourceService as never,
      warmup as never,
      undefined,
      movieTargets as never
    );

    const prepared = await service.prepare(
      { kind: 'movie', mediaId: 42 },
      {
        through: 'sources',
        preferences: { quality: 'auto', allowHevc: true },
        workClass: 'background',
      }
    );

    expect(prepared).toMatchObject({
      source,
      state: 'metadata',
      warmup: { state: 'not_requested' },
    });
    expect(warmup.warm).not.toHaveBeenCalled();
    expect(sourceService.processSourceMetadata).not.toHaveBeenCalled();
  });

  it('keeps selected quality and source type while details escalates to warmup', async () => {
    const source = {
      id: 12,
      file: Buffer.from('torrent'),
      hash: 'b'.repeat(40),
      magnetLink: 'magnet:?xt=urn:btih:details',
      quality: Quality.FHD,
      sourceType: Source.CAM,
      videoCodec: null,
      streamingScore: 12,
    };
    const mediaService = {
      getMovieByMediaId: jest.fn().mockResolvedValue({
        local: {
          id: 7,
          mediaId: 42,
          imdbId: 'tt0000001',
          title: 'Test Movie',
          contentDirectoriesSearched: [],
        },
      }),
    };
    const sourceService = {
      getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([source]),
      processSourceMetadata: jest.fn(),
      getSourcesForMovie: jest.fn(),
    };
    const warmup = { warm: jest.fn().mockResolvedValue({ state: 'warming' }) };
    const service = new PlayablePreparationService(
      mediaService as never,
      sourceService as never,
      warmup as never,
      undefined,
      movieTargets as never
    );

    const prepared = await service.prepare(
      { kind: 'movie', mediaId: 42 },
      {
        through: 'warm',
        preferences: { quality: 'auto', allowHevc: true },
        workClass: 'background',
      }
    );

    expect(prepared.source).toMatchObject({
      id: source.id,
      quality: Quality.FHD,
      sourceType: Source.CAM,
    });
    expect(prepared.warmup).toEqual({ state: 'warming' });
  });

  it('prefers an existing metadata-backed source over an earlier database row', async () => {
    const pending = {
      id: 7,
      file: undefined,
      hash: 'b'.repeat(40),
      magnetLink: 'magnet:?xt=urn:btih:pending',
      quality: null,
      videoCodec: null,
      streamingScore: 9_000,
    };
    const ready = {
      id: 9,
      file: Buffer.from('torrent'),
      hash: 'a'.repeat(40),
      magnetLink: 'magnet:?xt=urn:btih:ready',
      quality: null,
      videoCodec: null,
      streamingScore: 0,
    };
    const mediaService = {
      getMovieByMediaId: jest.fn().mockResolvedValue({
        local: {
          id: 7,
          mediaId: 42,
          imdbId: 'tt0000001',
          title: 'Test Movie',
          contentDirectoriesSearched: [],
        },
      }),
    };
    const sourceService = {
      getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([pending, ready]),
      processSourceMetadata: jest.fn(),
      getSourcesForMovie: jest.fn(),
    };
    const warmup = { warm: jest.fn().mockResolvedValue({ state: 'warming' }) };
    const service = new PlayablePreparationService(
      mediaService as never,
      sourceService as never,
      warmup as never,
      undefined,
      movieTargets as never
    );

    const prepared = await service.prepare(
      { kind: 'movie', mediaId: 42 },
      {
        through: 'warm',
        preferences: { quality: 'auto', allowHevc: true },
        workClass: 'interactive',
      }
    );

    expect(prepared.source).toBe(ready);
    expect(prepared.state).toBe('warming');
    expect(sourceService.processSourceMetadata).not.toHaveBeenCalled();
    expect(warmup.warm).toHaveBeenCalledWith(movieTarget(ready), 'm:42', 'm:42', {});
  });

  it('skips a source that stalled during playback while another candidate remains', async () => {
    const stalled = {
      id: 1,
      file: Buffer.from('a'),
      quality: null,
      videoCodec: null,
      streamingScore: 9,
    };
    const healthy = {
      id: 2,
      file: Buffer.from('b'),
      quality: null,
      videoCodec: null,
      streamingScore: 1,
    };
    const sourceService = {
      getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([stalled, healthy]),
      processSourceMetadata: jest.fn(),
    };
    const hasFailed = jest.fn((id: number) => id === 1);
    const prepare = (sources: unknown[]) => {
      sourceService.getSourcesForMovieWithOnDemandSearch.mockResolvedValue(sources);
      return new PlayablePreparationService(
        { getMovieByMediaId: jest.fn().mockResolvedValue({ local: { id: 7 } }) } as never,
        sourceService as never,
        undefined,
        undefined,
        movieTargets as never,
        { hasFailed }
      ).prepare(
        { kind: 'movie', mediaId: 42 },
        {
          through: 'sources',
          preferences: { quality: 'auto', allowHevc: true },
          workClass: 'interactive',
        }
      );
    };

    expect((await prepare([stalled, healthy])).source).toBe(healthy);
    // With nothing else to try, the stalled source is still better than no source.
    expect((await prepare([stalled])).source).toBe(stalled);
  });

  it('moves to the next source when the chosen movie source holds no video', async () => {
    const fake = {
      id: 1,
      file: Buffer.from('a'),
      quality: null,
      videoCodec: null,
      streamingScore: 9,
    };
    const real = {
      id: 2,
      file: Buffer.from('b'),
      quality: null,
      videoCodec: null,
      streamingScore: 1,
    };
    const health = new SourceHealthService();
    const targets = {
      forMovie: jest.fn(async (_movieId: number, source: { id: number }) => {
        if (source.id === 1) {
          health.markFailed(1);
          throw new Error('Source does not contain a video file');
        }
        return { source, filePath: 'movie.mkv', matchKind: 'movie' };
      }),
    };
    const service = new PlayablePreparationService(
      { getMovieByMediaId: jest.fn().mockResolvedValue({ local: { id: 7 } }) } as never,
      {
        getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([fake, real]),
        processSourceMetadata: jest.fn(),
      } as never,
      undefined,
      undefined,
      targets as never,
      health
    );

    const prepared = await service.prepare(
      { kind: 'movie', mediaId: 42 },
      {
        through: 'warm',
        preferences: { quality: 'auto', allowHevc: true },
        workClass: 'interactive',
      }
    );

    expect(targets.forMovie.mock.calls.map(([, source]) => source.id)).toEqual([1, 2]);
    expect(prepared).toMatchObject({ source: real, target: { filePath: 'movie.mkv' } });
  });

  it('prepares a backup by resolving another source without warming it', async () => {
    const primary = {
      id: 1,
      file: Buffer.from('a'),
      quality: null,
      videoCodec: null,
      streamingScore: 9,
    };
    const backup = {
      id: 2,
      file: Buffer.from('b'),
      quality: null,
      videoCodec: null,
      streamingScore: 1,
    };
    const warmup = { warm: jest.fn() };
    const service = new PlayablePreparationService(
      { getMovieByMediaId: jest.fn().mockResolvedValue({ local: { id: 7 } }) } as never,
      {
        getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([primary, backup]),
        processSourceMetadata: jest.fn(),
      } as never,
      warmup as never,
      undefined,
      movieTargets as never
    );

    const prepared = await service.prepare(
      { kind: 'movie', mediaId: 42 },
      {
        through: 'warm',
        resolveOnly: true,
        avoidSourceIds: [1],
        preferences: { quality: 'auto', allowHevc: true },
        workClass: 'background',
      }
    );

    expect(prepared).toMatchObject({ source: backup, target: movieTarget(backup), state: 'cold' });
    expect(warmup.warm).not.toHaveBeenCalled();
  });

  it('falls back to magnet playback when source metadata cannot be resolved', async () => {
    const source = {
      id: 208,
      file: undefined,
      hash: 'a'.repeat(40),
      magnetLink: 'magnet:?xt=urn:btih:test',
      quality: null,
      videoCodec: null,
    };
    const media = {
      local: {
        id: 7,
        mediaId: 42,
        imdbId: 'tt0000001',
        title: 'Test Movie',
        contentDirectoriesSearched: [],
      },
    };
    const mediaService = {
      getMovieByMediaId: jest.fn().mockResolvedValue(media),
    };
    const sourceService = {
      getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([source]),
      processSourceMetadata: jest
        .fn()
        .mockRejectedValue(new Error('Source metadata could not be resolved')),
      getSourcesForMovie: jest.fn().mockResolvedValue([source]),
    };
    const warmup = {
      warm: jest.fn().mockResolvedValue({ state: 'warming' }),
    };
    const service = new PlayablePreparationService(
      mediaService as never,
      sourceService as never,
      warmup as never,
      undefined,
      movieTargets as never
    );
    const playable: PlayableRef = { kind: 'movie', mediaId: 42 };

    const prepared = await service.prepare(playable, {
      through: 'warm',
      preferences: { quality: 'auto', allowHevc: true },
      workClass: 'interactive',
      ownerKey: 'm:42',
    });

    expect(prepared).toMatchObject({ playable, source, state: 'warming' });
    expect(sourceService.processSourceMetadata).toHaveBeenCalledWith(208);
    expect(warmup.warm).toHaveBeenCalledWith(movieTarget(source), 'm:42', 'm:42', {});
  });

  it('does not report metadata readiness when the selected source has no file', async () => {
    const source = {
      id: 208,
      file: undefined,
      hash: 'a'.repeat(40),
      magnetLink: 'magnet:?xt=urn:btih:test',
      quality: null,
      videoCodec: null,
    };
    const mediaService = {
      getMovieByMediaId: jest.fn().mockResolvedValue({
        local: {
          id: 7,
          mediaId: 42,
          imdbId: 'tt0000001',
          title: 'Test Movie',
          contentDirectoriesSearched: [],
        },
      }),
    };
    const sourceService = {
      getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([source]),
      processSourceMetadata: jest.fn().mockResolvedValue(undefined),
      getSourcesForMovie: jest.fn().mockResolvedValue([source]),
    };
    const warmup = { warm: jest.fn() };
    const service = new PlayablePreparationService(
      mediaService as never,
      sourceService as never,
      warmup as never,
      undefined,
      movieTargets as never
    );

    await expect(
      service.prepare(
        { kind: 'movie', mediaId: 42 },
        {
          through: 'metadata',
          preferences: { quality: 'auto', allowHevc: true },
          workClass: 'interactive',
        }
      )
    ).resolves.toMatchObject({ source, state: 'metadata' });
    expect(warmup.warm).not.toHaveBeenCalled();
  });

  it('drops a fallback source if refresh removes it or makes it incompatible', async () => {
    const source = {
      id: 208,
      file: undefined,
      hash: 'a'.repeat(40),
      magnetLink: 'magnet:?xt=urn:btih:test',
      quality: null,
      videoCodec: null,
    };
    const mediaService = {
      getMovieByMediaId: jest.fn().mockResolvedValue({
        local: {
          id: 7,
          mediaId: 42,
          imdbId: 'tt0000001',
          title: 'Test Movie',
          contentDirectoriesSearched: [],
        },
      }),
    };
    const sourceService = {
      getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([source]),
      processSourceMetadata: jest.fn().mockResolvedValue(undefined),
      getSourcesForMovie: jest.fn().mockResolvedValue([]),
    };
    const warmup = { warm: jest.fn() };
    const service = new PlayablePreparationService(
      mediaService as never,
      sourceService as never,
      warmup as never,
      undefined,
      movieTargets as never
    );

    await expect(
      service.prepare(
        { kind: 'movie', mediaId: 42 },
        {
          through: 'warm',
          preferences: { quality: 'auto', allowHevc: true },
          workClass: 'interactive',
        }
      )
    ).resolves.toMatchObject({ source: null, state: 'metadata' });
    expect(warmup.warm).not.toHaveBeenCalled();
  });

  it('keeps the selected movie source cold when its file list cannot be resolved', async () => {
    const source = { id: 9, quality: Quality.FHD, streamingScore: 10, file: Buffer.from('t') };
    const warmup = { warm: jest.fn() };
    const service = new PlayablePreparationService(
      { getMovieByMediaId: jest.fn().mockResolvedValue({ local: { id: 7 } }) } as never,
      { getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([source]) } as never,
      warmup as never,
      undefined,
      { forMovie: jest.fn().mockRejectedValue(new Error('metadata timeout')) } as never
    );

    const prepared = await service.prepare(
      { kind: 'movie', mediaId: 42 },
      {
        through: 'warm',
        preferences: { quality: 'auto', allowHevc: true },
        workClass: 'interactive',
      }
    );

    expect(prepared).toMatchObject({ source, target: null, state: 'cold' });
    expect(prepared.warmup.state).toBe('failed');
    expect(warmup.warm).not.toHaveBeenCalled();
  });
});
