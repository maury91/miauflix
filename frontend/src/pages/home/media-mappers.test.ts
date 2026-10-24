import { mediaApi } from '@features/media/api/media.api';
import type { MovieResponse, ProgressEntry, ShowResponse } from '@miauflix/backend';
import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import { mediaFromMovie, mediaFromProgress, mediaFromShow } from './media-mappers';

const movie = {
  type: 'movie',
  id: 1,
  mediaId: 101,
  imdbId: 'tt0000101',
  title: 'A Movie',
  overview: 'Overview',
  tagline: 'Tagline',
  releaseDate: '2026-01-01',
  runtime: 120,
  poster: '/poster.jpg',
  backdrop: '/backdrop.jpg',
  backdropFocus: null,
  logo: '/logo.png',
  genres: ['Drama'],
  popularity: 10,
  rating: 7.5,
} as MovieResponse;

const show = {
  type: 'tvshow',
  id: 2,
  mediaId: 202,
  imdbId: null,
  title: 'A Show',
  overview: null,
  poster: null,
  backdrop: null,
  backdropFocus: null,
  logo: null,
  genres: ['Comedy'],
  popularity: null,
  rating: null,
  firstAirDate: null,
  seasons: [],
} as unknown as ShowResponse;

const progress = (playable: ProgressEntry['playable']): ProgressEntry => ({
  playable,
  state: 'paused',
  positionSeconds: 60,
  durationSeconds: 600,
  updatedAt: '2026-10-24T10:00:00Z',
});

const storeWith = async (seed: { movie?: MovieResponse; show?: ShowResponse }) => {
  const store = configureStore({
    reducer: { [mediaApi.reducerPath]: mediaApi.reducer },
    middleware: getDefault => getDefault().concat(mediaApi.middleware),
  });
  if (seed.movie)
    await store.dispatch(mediaApi.util.upsertQueryData('getMovie', seed.movie.mediaId, seed.movie));
  if (seed.show)
    await store.dispatch(mediaApi.util.upsertQueryData('getShow', seed.show.mediaId, seed.show));
  return store;
};

describe('media mappers', () => {
  it('maps a movie response to a movie card', () => {
    expect(mediaFromMovie(movie)).toMatchObject({
      _type: 'movie',
      mediaId: 101,
      title: 'A Movie',
      releaseDate: '2026-01-01',
      runtime: 120,
      logo: '/logo.png',
    });
  });

  it('maps a show response to a show card, filling missing optional fields', () => {
    expect(mediaFromShow(show)).toMatchObject({
      _type: 'tvshow',
      mediaId: 202,
      name: 'A Show',
      overview: '',
      poster: '',
      backdrop: '',
      logo: undefined,
      popularity: 0,
      rating: 0,
      firstAirDate: '',
    });
  });

  it.each([
    ['a movie', progress({ kind: 'movie', mediaId: 101 }), 'movie', 101],
    [
      'an episode, as its show',
      progress({ kind: 'episode', showMediaId: 202, seasonNumber: 1, episodeNumber: 2 }),
      'tvshow',
      202,
    ],
  ])('builds the card for %s from the catalog cache', async (_name, entry, type, mediaId) => {
    const state = (await storeWith({ movie, show })).getState();
    expect(mediaFromProgress(state, entry)).toMatchObject({ _type: type, mediaId });
  });

  it('returns null when the title is not cached yet', async () => {
    const state = (await storeWith({})).getState();
    expect(mediaFromProgress(state, progress({ kind: 'movie', mediaId: 101 }))).toBeNull();
    expect(
      mediaFromProgress(
        state,
        progress({ kind: 'episode', showMediaId: 202, seasonNumber: 1, episodeNumber: 1 })
      )
    ).toBeNull();
  });
});
