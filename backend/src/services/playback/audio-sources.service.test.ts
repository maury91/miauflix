import { Language } from '@miauwatch/source-metadata-extractor';

import type { ContentSource } from '@entities/content-source.entity';

import { AudioSourcesService } from './audio-sources.service';

const source = (id: number, overrides: Partial<ContentSource> = {}) =>
  ({
    id,
    quality: '1080p',
    sourceType: 'web',
    videoCodec: 'x264',
    size: 1000,
    broadcasters: id,
    languages: null,
    hasVideo: null,
    ...overrides,
  }) as unknown as ContentSource;

const probe = (sourceId: number, filePath: string, languages: string[]) => ({
  sourceId,
  filePath,
  result: JSON.stringify({
    streams: [
      { codec_type: 'video', codec_name: 'h264' },
      ...languages.map(language => ({
        codec_type: 'audio',
        codec_name: 'aac',
        channels: 6,
        tags: { language },
      })),
    ],
  }),
});

function setup() {
  const media = {
    getMovieByMediaId: jest.fn().mockResolvedValue({ local: { id: 7 } }),
    getTVShowByMediaId: jest
      .fn()
      .mockResolvedValue({ local: { mediaId: 50, name: 'Show', firstAirDate: '2020-01-01' } }),
    getSeason: jest.fn().mockResolvedValue({
      episodes: [{ id: 99, episodeNumber: 2, airDate: '2020-01-08' }],
    }),
  };
  const sources = {
    getSourcesForMovie: jest.fn(),
    searchMovieSourcesInLanguage: jest.fn(),
    getSourcesForEpisodeWithOnDemandSearch: jest.fn(),
  };
  const episodeSources = { findByEpisodeId: jest.fn() };
  const probes = { findBySourceIds: jest.fn().mockResolvedValue([]) };
  const service = new AudioSourcesService(
    media as never,
    sources as never,
    episodeSources as never,
    probes as never
  );
  return { service, sources, episodeSources, probes };
}

describe('AudioSourcesService', () => {
  it("lists a movie's usable sources with their release and probed languages, best swarm first", async () => {
    const { service, sources, probes } = setup();
    sources.getSourcesForMovie.mockResolvedValue([
      source(1, { languages: [Language.LITHUANIAN, Language.MULTI] }),
      source(2, { hasVideo: false }),
      source(3),
    ]);
    probes.findBySourceIds.mockResolvedValue([probe(3, 'movie.mkv', ['eng', 'lit'])]);

    const { sources: listed } = await service.list({ kind: 'movie', mediaId: 10 });

    expect(probes.findBySourceIds).toHaveBeenCalledWith([1, 3]);
    expect(listed.map(item => item.id)).toEqual([3, 1]);
    expect(listed[1]).toMatchObject({ releaseLanguages: ['lt'], audioTracks: null });
    expect(listed[0]!.audioTracks).toEqual([
      { language: 'eng', title: null, codec: 'aac', channels: 6 },
      { language: 'lit', title: null, codec: 'aac', channels: 6 },
    ]);
  });

  it('searches a movie in a language', async () => {
    const { service, sources } = setup();
    sources.searchMovieSourcesInLanguage.mockResolvedValue([source(4)]);
    const { sources: listed } = await service.search({ kind: 'movie', mediaId: 10 }, 'it');
    expect(sources.searchMovieSourcesInLanguage).toHaveBeenCalledWith(7, 'it');
    expect(listed.map(item => item.id)).toEqual([4]);
  });

  it("lists an episode's files, with the probe of its own file", async () => {
    const { service, sources, episodeSources, probes } = setup();
    const matches = [
      { source: source(5), videoFilePath: 'S01E02.mkv' },
      { source: source(6), videoFilePath: null },
    ];
    episodeSources.findByEpisodeId.mockResolvedValue(matches);
    probes.findBySourceIds.mockResolvedValue([
      probe(5, 'S01E01.mkv', ['eng']),
      probe(5, 'S01E02.mkv', ['ita']),
    ]);
    const episode = {
      kind: 'episode',
      showMediaId: 50,
      seasonNumber: 1,
      episodeNumber: 2,
    } as const;

    const { sources: listed } = await service.list(episode);
    expect(episodeSources.findByEpisodeId).toHaveBeenCalledWith(99);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.audioTracks?.[0]?.language).toBe('ita');

    sources.getSourcesForEpisodeWithOnDemandSearch.mockResolvedValue(matches);
    await service.search(episode, 'it');
    expect(sources.getSourcesForEpisodeWithOnDemandSearch).toHaveBeenCalledWith(
      expect.objectContaining({ episodeId: 99, language: 'it', showTitle: 'Show' })
    );
  });
});
