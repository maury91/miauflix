// A test torrent file is its file list as JSON
jest.mock('parse-torrent', () =>
  jest.fn(async (file: Buffer) => ({ files: JSON.parse(file.toString()) }))
);

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

interface StoredFields {
  downloaded?: number;
  videoCompletedAt?: Date | null;
  localOnly?: boolean;
}

/** A media-load client whose stored sources are the records `find` returns. */
const storageOf = (find: (id: number) => StoredFields | null) => ({
  getStorageStates: jest.fn(async (ids: number[]) =>
    ids.flatMap(id => {
      const stored = find(id);
      return stored
        ? [
            {
              sourceId: id,
              verifiedBytes: 0,
              allocatedBytes: 0,
              downloaded: stored.downloaded ?? 0,
              videoComplete: Boolean(stored.videoCompletedAt),
              localOnly: Boolean(stored.localOnly),
            },
          ]
        : [];
    })
  ),
});

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
      getMovieByMediaId: jest.fn().mockResolvedValue({
        local: { id: 7, mediaId: 42, releaseDate: '2020-05-01' },
      }),
    };
    const sourceService = {
      requestMovieVerification: jest.fn(),
      getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([fresh, downloaded]),
      processSourceMetadata: jest.fn(),
    };
    const storageService = storageOf(id => (id === 1 ? completion : null));
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
    expect(sourceService.getSourcesForMovieWithOnDemandSearch).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, mediaId: 42, releaseDate: '2020-05-01' }),
      3_000
    );
    expect(warmup.warm).toHaveBeenCalledWith(movieTarget(downloaded), 'm:42', 'm:42', {});
    expect(sourceService.processSourceMetadata).not.toHaveBeenCalled();
  });

  it('warms where a resume will start', async () => {
    const source = { id: 1, quality: Quality.HD, streamingScore: 1, file: null };
    const warmup = { warm: jest.fn().mockResolvedValue({ state: 'warming' }) };
    const service = new PlayablePreparationService(
      { getMovieByMediaId: jest.fn().mockResolvedValue({ local: { id: 7 } }) } as never,
      {
        requestMovieVerification: jest.fn(),
        getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([source]),
        processSourceMetadata: jest.fn(),
      } as never,
      warmup as never,
      storageOf(() => ({ downloaded: 10000 })) as never,
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
        requestMovieVerification: jest.fn(),
        getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([fresh, downloaded]),
      } as never,
      undefined,
      storageOf(id => (id === 1 ? cached : null)) as never
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
      requestMovieVerification: jest.fn(),
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
      requestMovieVerification: jest.fn(),
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

  describe('with a bitrate cap', () => {
    const GB = 2 ** 30;
    /** A 100-minute movie: 1 GB is about 1.4 Mbit/s. */
    const setupCapped = (
      sources: object[],
      downloadedIds: number[] = [],
      quality: Quality | 'auto' = 'auto'
    ) => {
      const mediaService = {
        getMovieByMediaId: jest.fn().mockResolvedValue({ local: { id: 7, runtime: 100 } }),
      };
      const sourceService = {
        requestMovieVerification: jest.fn(),
        getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue(sources),
        processSourceMetadata: jest.fn(),
      };
      const storageService = storageOf(id =>
        downloadedIds.includes(id) ? { videoCompletedAt: new Date(), downloaded: 10000 } : null
      );
      const warmup = { warm: jest.fn().mockResolvedValue({ state: 'ready' }) };
      const service = new PlayablePreparationService(
        mediaService as never,
        sourceService as never,
        warmup as never,
        storageService as never,
        movieTargets as never
      );
      const prepare = (through: 'sources' | 'warm') =>
        service.prepare(
          { kind: 'movie', mediaId: 42 },
          {
            through,
            preferences: { quality, allowHevc: true, maxBitrateKbps: 8_000 },
            workClass: 'interactive',
          }
        );
      return { prepare };
    };
    const source = (id: number, sizeGb: number, streamingScore: number) => ({
      id,
      quality: Quality['4K'],
      size: sizeGb * GB,
      streamingScore,
      file: Buffer.from(`torrent ${id}`),
    });

    it('keeps an explicitly requested quality within the cap', async () => {
      const heavy4k = source(1, 17, 10_000);
      const fhd = { ...source(2, 3, 8_000), quality: Quality.FHD };
      const lean4k = source(3, 4.5, 7_000);

      expect(
        (await setupCapped([heavy4k, fhd, lean4k], [], Quality['4K']).prepare('sources')).source
      ).toBe(lean4k);
      expect((await setupCapped([heavy4k, fhd], [], Quality['4K']).prepare('sources')).source).toBe(
        fhd
      );
    });

    it('passes over a finished download above the cap for a leaner source', async () => {
      const remux = source(1, 24, 7_000);
      const heavy = source(2, 17, 10_000);
      const lean = source(3, 4.5, 9_000);
      const { prepare } = setupCapped([remux, heavy, lean], [remux.id]);

      for (const through of ['sources', 'warm'] as const) {
        expect((await prepare(through)).source).toBe(lean);
      }
    });

    it('keeps a finished download that fits the cap', async () => {
      const downloaded = source(1, 4, 5_000);
      const fresh = source(2, 4.5, 9_000);
      const { prepare } = setupCapped([fresh, downloaded], [downloaded.id]);

      expect((await prepare('warm')).source).toBe(downloaded);
    });

    it('falls back to the leanest source when none fits', async () => {
      const heavier = source(1, 24, 10_000);
      const lighter = source(2, 17, 5_000);
      const { prepare } = setupCapped([heavier, lighter]);

      expect((await prepare('warm')).source).toBe(lighter);
    });
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
      requestMovieVerification: jest.fn(),
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
      requestMovieVerification: jest.fn(),
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

  /** Sources whose target resolution proves them fake, the way PlaybackTargetService does. */
  const fakeAwareTargets = (fakeIds: number[]) => ({
    forMovie: jest.fn(async (_movieId: number, source: { id: number; hasVideo?: boolean }) => {
      if (fakeIds.includes(source.id)) {
        source.hasVideo = false;
        throw new Error('Source does not contain a video file');
      }
      return { source, filePath: 'movie.mkv', matchKind: 'movie' };
    }),
  });
  const candidate = (id: number, streamingScore: number, hasVideo: boolean | null = null) => ({
    id,
    file: Buffer.from(String(id)),
    quality: null,
    videoCodec: null,
    streamingScore,
    hasVideo,
  });
  const movieService = (sources: unknown[]) => ({
    requestMovieVerification: jest.fn(),
    getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue(sources),
    processSourceMetadata: jest.fn(),
  });
  const warmOptions = (onSourceAttempt?: jest.Mock) => ({
    through: 'warm' as const,
    preferences: { quality: 'auto' as const, allowHevc: true },
    workClass: 'interactive' as const,
    ...(onSourceAttempt ? { onSourceAttempt } : {}),
  });

  it('walks past every fake until a real source and reports each attempt', async () => {
    const sources = [candidate(1, 9), candidate(2, 8), candidate(3, 7), candidate(4, 6)];
    const targets = fakeAwareTargets([1, 2, 3]);
    const onSourceAttempt = jest.fn();
    const service = new PlayablePreparationService(
      { getMovieByMediaId: jest.fn().mockResolvedValue({ local: { id: 7 } }) } as never,
      movieService(sources) as never,
      undefined,
      undefined,
      targets as never,
      new SourceHealthService()
    );

    const prepared = await service.prepare(
      { kind: 'movie', mediaId: 42 },
      warmOptions(onSourceAttempt)
    );

    expect(targets.forMovie.mock.calls.map(([, source]) => source.id)).toEqual([1, 2, 3, 4]);
    expect(prepared).toMatchObject({ source: sources[3], target: { filePath: 'movie.mkv' } });
    expect(onSourceAttempt.mock.calls.map(([attempt]) => attempt)).toEqual([
      { sourceId: 1, position: 1, total: 4 },
      { sourceId: 2, position: 2, total: 4 },
      { sourceId: 3, position: 3, total: 4 },
      { sourceId: 4, position: 4, total: 4 },
    ]);
  });

  it('reports exhaustion once every source proves fake', async () => {
    const sources = [candidate(1, 9), candidate(2, 8)];
    const service = new PlayablePreparationService(
      { getMovieByMediaId: jest.fn().mockResolvedValue({ local: { id: 7 } }) } as never,
      movieService(sources) as never,
      undefined,
      undefined,
      fakeAwareTargets([1, 2]) as never,
      new SourceHealthService()
    );

    const prepared = await service.prepare({ kind: 'movie', mediaId: 42 }, warmOptions());

    expect(prepared).toMatchObject({ source: null, target: null, exhausted: true });
  });

  it('never picks a source already known to be fake', async () => {
    const sources = [candidate(1, 9, false), candidate(2, 1)];
    const targets = fakeAwareTargets([]);
    const service = new PlayablePreparationService(
      { getMovieByMediaId: jest.fn().mockResolvedValue({ local: { id: 7 } }) } as never,
      movieService(sources) as never,
      undefined,
      undefined,
      targets as never,
      new SourceHealthService()
    );
    const onSourceAttempt = jest.fn();

    await service.prepare({ kind: 'movie', mediaId: 42 }, warmOptions(onSourceAttempt));

    expect(targets.forMovie.mock.calls.map(([, source]) => source.id)).toEqual([2]);
    expect(onSourceAttempt).toHaveBeenCalledWith({ sourceId: 2, position: 2, total: 2 });
  });

  it('prefers a recently played source among close candidates, but never over the asked quality', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const seeded = { ...candidate(1, 3_100), quality: Quality.FHD };
    const played = { ...candidate(2, 3_000), quality: Quality.HD, lastPlayedOn: today };
    const prepare = (quality: Quality | 'auto') =>
      new PlayablePreparationService(
        { getMovieByMediaId: jest.fn().mockResolvedValue({ local: { id: 7 } }) } as never,
        movieService([seeded, played]) as never
      ).prepare(
        { kind: 'movie', mediaId: 42 },
        { ...warmOptions(), through: 'sources', preferences: { quality, allowHevc: true } }
      );

    expect((await prepare('auto')).source).toBe(played);
    expect((await prepare(Quality.FHD)).source).toBe(seeded);
  });

  it('is exhausted without trying anything when every source is known fake', async () => {
    const targets = fakeAwareTargets([]);
    const sourceService = movieService([candidate(1, 9, false), candidate(2, 1, false)]);
    const service = new PlayablePreparationService(
      { getMovieByMediaId: jest.fn().mockResolvedValue({ local: { id: 7 } }) } as never,
      sourceService as never,
      undefined,
      undefined,
      targets as never
    );

    const prepared = await service.prepare({ kind: 'movie', mediaId: 42 }, warmOptions());

    expect(prepared.exhausted).toBe(true);
    expect(targets.forMovie).not.toHaveBeenCalled();
  });

  it('queues background verification while no candidate is verified', async () => {
    const sourceService = movieService([candidate(1, 9)]);
    const service = new PlayablePreparationService(
      { getMovieByMediaId: jest.fn().mockResolvedValue({ local: { id: 7 } }) } as never,
      sourceService as never
    );

    await service.prepare(
      { kind: 'movie', mediaId: 42 },
      { ...warmOptions(), through: 'sources', workClass: 'background' }
    );

    expect(sourceService.requestMovieVerification).toHaveBeenCalledWith(7, 10);
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
        requestMovieVerification: jest.fn(),
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
        requestMovieVerification: jest.fn(),
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
      requestMovieVerification: jest.fn(),
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
      requestMovieVerification: jest.fn(),
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
      requestMovieVerification: jest.fn(),
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
      {
        getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([source]),
        requestMovieVerification: jest.fn(),
      } as never,
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

  describe('episodes under a bitrate cap', () => {
    const GB = 1024 ** 3;
    const torrent = (files: Array<{ path: string; length: number }>) =>
      Buffer.from(JSON.stringify(files));
    // A 2160p episode release: 6 GB for one 45-minute episode, about 19 Mbit/s
    const heavy = {
      id: 41,
      quality: Quality['4K'],
      streamingScore: 90,
      size: 6 * GB,
      hasVideo: true,
      file: torrent([{ path: 'Show.S01E02.2160p.mkv', length: 6 * GB }]),
    };
    // A season pack: 10 GB in all, but its episode file is 1.2 GB, about 3.8 Mbit/s
    const pack = {
      id: 42,
      quality: Quality.FHD,
      streamingScore: 50,
      size: 10 * GB,
      hasVideo: true,
      file: torrent([
        { path: 'Show S01/Show.S01E01.mkv', length: 1.2 * GB },
        { path: 'Show S01/Show.S01E02.mkv', length: 1.2 * GB },
      ]),
    };
    const setup = (
      episodeRuntime: number | null,
      packMatch: { source: object; videoFilePath: string } = {
        source: pack,
        videoFilePath: 'Show S01/Show.S01E02.mkv',
      }
    ) => {
      const service = new PlayablePreparationService(
        {
          getTVShowByMediaId: jest.fn().mockResolvedValue({
            local: { id: 3, mediaId: 900, name: 'Show', imdbId: 'tt1', episodeRuntime },
          }),
          markShowAsWatching: jest.fn(),
          getSeason: jest
            .fn()
            .mockResolvedValue({ episodes: [{ id: 81, episodeNumber: 2, airDate: null }] }),
        } as never,
        {
          getSourcesForEpisodeWithOnDemandSearch: jest.fn().mockResolvedValue([
            { source: heavy, videoFilePath: 'Show.S01E02.2160p.mkv', matchKind: 'single' },
            { ...packMatch, matchKind: 'single' },
          ]),
        } as never
      );
      return (maxBitrateKbps?: number) =>
        service.prepare(
          { kind: 'episode', showMediaId: 900, seasonNumber: 1, episodeNumber: 2 },
          {
            through: 'sources',
            preferences: { quality: 'auto', allowHevc: true, maxBitrateKbps },
            workClass: 'interactive',
          }
        );
    };

    it('ranks a season pack by its episode file, against the show episode length', async () => {
      const prepare = setup(45);
      await expect(prepare(8_000)).resolves.toMatchObject({ source: pack });
      await expect(prepare()).resolves.toMatchObject({ source: heavy });
    });

    it('finds a provider-relative episode path under the torrent folder', async () => {
      // Its 10 GB episode file is over the cap and heavier than the 6 GB source; left unknown,
      // the pack would count as fitting and win.
      const remuxPack = {
        ...pack,
        file: torrent([
          { path: 'Show S01/Show.S01E01.mkv', length: 10 * GB },
          { path: 'Show S01/Show.S01E02.mkv', length: 10 * GB },
        ]),
      };
      const prepare = setup(45, { source: remuxPack, videoFilePath: 'Show.S01E02.mkv' });
      await expect(prepare(8_000)).resolves.toMatchObject({ source: heavy });
    });

    it('leaves the episode file unknown when its relative path matches more than one', async () => {
      // Resolving either 20 GB file would rank the pack after the lighter 6 GB source.
      const ambiguous = {
        ...pack,
        file: torrent([
          { path: 'Show S01/A/Show.S01E02.mkv', length: 20 * GB },
          { path: 'Show S01/B/Show.S01E02.mkv', length: 20 * GB },
        ]),
      };
      const prepare = setup(45, { source: ambiguous, videoFilePath: 'Show.S01E02.mkv' });
      await expect(prepare(8_000)).resolves.toMatchObject({ source: ambiguous });
    });

    it('keeps the order when the show episode length is unknown', async () => {
      await expect(setup(null)(8_000)).resolves.toMatchObject({ source: heavy });
    });
  });

  it('keeps the episode source it tried when no other candidate remains', async () => {
    const source = { id: 31, quality: Quality.FHD, streamingScore: 10, hasVideo: null };
    const mediaService = {
      getTVShowByMediaId: jest
        .fn()
        .mockResolvedValue({ local: { id: 3, mediaId: 900, name: 'Show', imdbId: 'tt1' } }),
      markShowAsWatching: jest.fn(),
      getSeason: jest
        .fn()
        .mockResolvedValue({ episodes: [{ id: 81, episodeNumber: 2, airDate: null }] }),
    };
    const sourceService = {
      getSourcesForEpisodeWithOnDemandSearch: jest
        .fn()
        .mockResolvedValue([{ source, videoFilePath: 'S01E02.mkv', matchKind: 'single' }]),
    };
    const targets = { forEpisode: jest.fn().mockRejectedValue(new Error('no peers')) };
    const health = new SourceHealthService();
    health.markFailed(source.id);
    const service = new PlayablePreparationService(
      mediaService as never,
      sourceService as never,
      { warm: jest.fn() } as never,
      undefined,
      targets as never,
      health
    );

    const result = await service.prepare(
      { kind: 'episode', showMediaId: 900, seasonNumber: 1, episodeNumber: 2 },
      {
        through: 'warm',
        preferences: { quality: 'auto', allowHevc: true },
        workClass: 'interactive',
      }
    );

    expect(targets.forEpisode).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ source, target: null, state: 'cold' });
    expect(result.warmup.state).toBe('failed');
  });
});
