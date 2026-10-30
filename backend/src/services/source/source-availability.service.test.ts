import { configureFakerSeed } from '@__test-utils__/utils';

import type { Database } from '@database/database';
import { EpisodeSource } from '@entities/episode-source.entity';
import { Movie } from '@entities/movie.entity';

import { availabilityOf, SourceAvailabilityService } from './source-availability.service';

const fakeFiles = [{ path: 'Clayface (2026) 1080p WEB-DL.exe', length: 1_283_601_623 }];
const realFiles = [
  { path: 'Movie (2026)/Movie.2026.1080p.mkv', length: 2_000_000_000 },
  { path: 'Movie (2026)/Movie.2026.en.srt', length: 80_000 },
];

describe('availabilityOf', () => {
  it.each([
    { sources: [{ hasVideo: true }, { hasVideo: false }], searched: false, expected: 'available' },
    { sources: [{ hasVideo: null }, { hasVideo: false }], searched: true, expected: 'pending' },
    {
      sources: [{ hasVideo: false }, { hasVideo: false }],
      searched: false,
      expected: 'unavailable',
    },
    { sources: [], searched: true, expected: 'unavailable' },
    { sources: [], searched: false, expected: 'pending' },
  ] as const)('$expected for $sources (searched: $searched)', ({ sources, searched, expected }) => {
    expect(availabilityOf(sources, searched)).toBe(expected);
  });
});

describe('SourceAvailabilityService', () => {
  const setupTest = ({ changed = true, linkedSources = [{ hasVideo: false }] } = {}) => {
    const contentSources = {
      setHasVideo: jest.fn().mockResolvedValue(changed),
      findByMovieId: jest.fn().mockResolvedValue(linkedSources),
      findQuality: jest.fn().mockResolvedValue({ quality: 'FHD', sourceType: 'BLURAY' }),
    };
    const movieQuery = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockResolvedValue([
          { id: 7, mediaId: 1400940, title: 'Clayface', contentDirectoriesSearched: ['YTS'] },
        ]),
    };
    const episodeSources = { find: jest.fn().mockResolvedValue([]) };
    const database = {
      getContentSourceRepository: () => contentSources,
      getRepository: (entity: unknown) =>
        entity === Movie
          ? { createQueryBuilder: () => movieQuery }
          : entity === EpisodeSource
            ? episodeSources
            : undefined,
    } as unknown as Database;
    const notifications = { playableAvailable: jest.fn(), episodeAvailable: jest.fn() };
    const service = new SourceAvailabilityService(database, notifications, () => ['YTS']);
    const changes = jest.fn();
    service.onChange(changes);
    return { service, contentSources, notifications, changes, episodeSources };
  };

  beforeAll(() => {
    configureFakerSeed();
  });

  it('marks a source fake and tells listeners its movie has no source left', async () => {
    const { service, contentSources, changes, notifications } = setupTest();

    await expect(service.recordFiles(4904, fakeFiles)).resolves.toBe(false);

    expect(contentSources.setHasVideo).toHaveBeenCalledWith(4904, false);
    expect(changes).toHaveBeenCalledWith({
      playable: { kind: 'movie', mediaId: 1400940 },
      availability: 'unavailable',
    });
    expect(notifications.playableAvailable).not.toHaveBeenCalled();
  });

  it('notifies the users waiting for a movie once a real source is found', async () => {
    const { service, contentSources, changes, notifications } = setupTest({
      linkedSources: [{ hasVideo: true }],
    });

    await expect(service.recordFiles(1, realFiles)).resolves.toBe(true);

    expect(contentSources.setHasVideo).toHaveBeenCalledWith(1, true);
    expect(changes).toHaveBeenCalledWith({
      playable: { kind: 'movie', mediaId: 1400940 },
      availability: 'available',
    });
    expect(contentSources.findQuality).toHaveBeenCalledWith(1);
    expect(notifications.playableAvailable).toHaveBeenCalledWith(
      { kind: 'movie', mediaId: 1400940 },
      'Clayface',
      { quality: 'FHD', sourceType: 'BLURAY' }
    );
  });

  it('publishes nothing when the stored verdict did not change', async () => {
    const { service, changes } = setupTest({ changed: false });

    await service.recordFiles(4904, fakeFiles);

    expect(changes).not.toHaveBeenCalled();
  });

  it('announces an episode when a source matched to it proves real', async () => {
    const { service, episodeSources, notifications, changes } = setupTest();
    const episode = {
      episodeNumber: 8,
      airDate: '2026-10-20',
      season: { seasonNumber: 1, tvShow: { mediaId: 9001, name: 'Example Show' } },
    };
    episodeSources.find
      .mockResolvedValueOnce([{ episodeId: 5, episode }])
      .mockResolvedValueOnce([{ episodeId: 5, source: { hasVideo: true } }]);

    await service.recordFiles(11, realFiles);

    const playable = { kind: 'episode', showMediaId: 9001, seasonNumber: 1, episodeNumber: 8 };
    expect(changes).toHaveBeenCalledWith({ playable, availability: 'available' });
    const source = { quality: 'FHD', sourceType: 'BLURAY' };
    expect(notifications.playableAvailable).toHaveBeenCalledWith(playable, 'Example Show', source);
    expect(notifications.episodeAvailable).toHaveBeenCalledWith({
      showMediaId: 9001,
      showTitle: 'Example Show',
      seasonNumber: 1,
      episodeNumber: 8,
      airDate: '2026-10-20',
      source,
    });
  });

  it('marks an episode unavailable only when every matched source is fake', async () => {
    const { service, episodeSources } = setupTest();
    episodeSources.find.mockResolvedValue([
      { episodeId: 1, source: { hasVideo: false } },
      { episodeId: 2, source: { hasVideo: false } },
      { episodeId: 2, source: { hasVideo: null } },
    ]);

    const availability = await service.forEpisodes([1, 2, 3]);

    expect(Object.fromEntries(availability)).toEqual({
      1: 'unavailable',
      2: 'pending',
      3: 'pending',
    });
  });
});
