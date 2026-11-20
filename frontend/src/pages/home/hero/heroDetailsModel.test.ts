import type { MediaDto, PreloadPreparationSnapshot } from '@miauflix/backend';

import { heroDetailsModel } from './heroDetailsModel';

const movie = {
  _type: 'movie',
  mediaId: 1,
  title: 'Dune',
  runtime: 155,
  releaseDate: '2021-10-22',
  rating: 7.84,
  genres: ['Science Fiction', 'Adventure'],
  overview: 'Paul Atreides travels to Arrakis.',
} as unknown as MediaDto;

const snapshot = (state: string, source?: object) =>
  ({ playable: { kind: 'movie' }, state, source }) as unknown as PreloadPreparationSnapshot;

describe('heroDetailsModel', () => {
  it('says what the hero shows about a movie', () => {
    expect(heroDetailsModel(movie)).toEqual({
      title: 'Dune',
      metadata: ['2h 35m', '2021'],
      rating: '7.8',
      status: { kind: 'checking' },
      genres: 'Science Fiction · Adventure',
      overview: 'Paul Atreides travels to Arrakis.',
    });
  });

  it('leaves out what a title lacks', () => {
    const bare = { ...movie, runtime: 0, rating: 0, genres: [], overview: undefined } as MediaDto;
    expect(heroDetailsModel(bare)).toMatchObject({
      metadata: ['2021'],
      rating: null,
      genres: null,
      overview: '',
    });
  });

  it('gives shows no source status', () => {
    const show = { ...movie, _type: 'tvshow', firstAirDate: '2019-01-01' } as unknown as MediaDto;
    expect(heroDetailsModel(show)).toMatchObject({ metadata: ['2019'], status: null });
  });

  it('reads the source status from the preparation and availability', () => {
    expect(heroDetailsModel(movie, null, 'unavailable').status).toEqual({ kind: 'unavailable' });
    expect(heroDetailsModel(movie, snapshot('unavailable')).status).toEqual({
      kind: 'unavailable',
    });
    expect(heroDetailsModel(movie, snapshot('unavailable'), 'available').status).toBeNull();
    const found = snapshot('source_found', { quality: '4K', sourceType: 'bluray' });
    expect(heroDetailsModel(movie, found).status).toMatchObject({ kind: 'quality', label: '4K' });
    // An unknown resolution shows as 720p once there is a source
    const unknown = snapshot('source_found', { quality: null, sourceType: null });
    expect(heroDetailsModel(movie, unknown).status).toMatchObject({ label: '720p' });
  });
});
