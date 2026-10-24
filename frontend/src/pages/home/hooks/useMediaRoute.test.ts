import type { AppRoute } from '@app/router';
import type { MediaDto } from '@miauflix/backend';
import { describe, expect, it } from 'vitest';

import { playableForRoute, routeTitle, selectedMediaFor, viewForRoute } from './useMediaRoute';

const movieCard = { _type: 'movie', mediaId: 7 } as MediaDto;
const showCard = { _type: 'tvshow', mediaId: 7 } as MediaDto;

const routes: Record<string, AppRoute> = {
  home: { type: 'home' },
  movieDetails: { type: 'movieDetails', mediaId: 7 },
  showDetails: { type: 'showDetails', mediaId: 7 },
  moviePlayer: { type: 'moviePlayer', mediaId: 7 },
  episodePlayer: { type: 'episodePlayer', showMediaId: 7, seasonNumber: 2, episodeNumber: 3 },
  settings: { type: 'settings' },
};

describe('route helpers', () => {
  it.each([
    ['home', 'browse', null, null],
    ['settings', 'browse', null, null],
    ['movieDetails', 'details', { kind: 'movie', mediaId: 7 }, null],
    ['showDetails', 'details', { kind: 'show', mediaId: 7 }, null],
    ['moviePlayer', 'player', { kind: 'movie', mediaId: 7 }, { kind: 'movie', mediaId: 7 }],
    [
      'episodePlayer',
      'player',
      { kind: 'show', mediaId: 7 },
      { kind: 'episode', showMediaId: 7, seasonNumber: 2, episodeNumber: 3 },
    ],
  ])('%s → %s', (name, view, title, playable) => {
    const route = routes[name]!;
    expect(viewForRoute(route)).toBe(view);
    expect(routeTitle(route)).toEqual(title);
    expect(playableForRoute(route)).toEqual(playable);
  });
});

describe('selectedMediaFor', () => {
  const routed = { _type: 'movie', mediaId: 7, title: 'Routed' } as MediaDto;

  it.each<[string, AppRoute, MediaDto | null, MediaDto | null, MediaDto | null]>([
    ['browsing shows the focused card', routes.home!, routed, showCard, showCard],
    ['details prefers the routed title', routes.movieDetails!, routed, movieCard, routed],
    [
      'details falls back to the card that opened it',
      routes.movieDetails!,
      null,
      movieCard,
      movieCard,
    ],
    [
      'a card of the other kind with the same id is not the title',
      routes.movieDetails!,
      null,
      showCard,
      null,
    ],
    ['an episode shows its show', routes.episodePlayer!, null, showCard, showCard],
    ['nothing selected yet', routes.showDetails!, null, null, null],
  ])('%s', (_name, route, routeMedia, browseSelection, expected) => {
    expect(selectedMediaFor(route, routeMedia, browseSelection)).toBe(expected);
  });
});
