import { Quality, Source } from '@miauflix/source-metadata-extractor';

import type { PlayableRef } from '@routes/playable.types';

import { PlayablePreparationService } from './playable-preparation.service';

describe('PlayablePreparationService', () => {
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
      warmup as never
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
      warmup as never
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
      warmup as never
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
    expect(warmup.warm).toHaveBeenCalledWith(
      ready,
      'm:42',
      'm:42',
      expect.objectContaining({ speculativeExpiresAt: expect.any(Date) })
    );
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
      warmup as never
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
    expect(warmup.warm).toHaveBeenCalledWith(
      source,
      'm:42',
      'm:42',
      expect.objectContaining({ speculativeExpiresAt: expect.any(Date) })
    );
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
      warmup as never
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
      warmup as never
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
});
