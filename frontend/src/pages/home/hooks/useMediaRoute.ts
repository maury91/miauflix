import type { AppRoute } from '@app/router';
import {
  useGetMovieQuery,
  useGetSeasonQuery,
  useGetShowQuery,
} from '@features/media/api/media.api';
import type { MediaDto, PlayableRef } from '@miauflix/backend';
import { skipToken } from '@reduxjs/toolkit/query';
import { useMemo } from 'react';

import {
  nextEpisode as findNextEpisode,
  nextEpisodeInSeason,
  nextSeasonNumber,
} from '../episode-rules';
import { mediaFromMovie, mediaFromShow } from '../media-mappers';

export type HomeView = 'browse' | 'details' | 'player';

/** Which of Home's three screens a route shows. */
export function viewForRoute(route: AppRoute): HomeView {
  if (route.type === 'movieDetails' || route.type === 'showDetails') return 'details';
  if (route.type === 'moviePlayer' || route.type === 'episodePlayer') return 'player';
  return 'browse';
}

/** The movie or show a details/player route is about, or null for other routes. */
export function routeTitle(route: AppRoute): { kind: 'movie' | 'show'; mediaId: number } | null {
  if (route.type === 'movieDetails' || route.type === 'moviePlayer')
    return { kind: 'movie', mediaId: route.mediaId };
  if (route.type === 'showDetails') return { kind: 'show', mediaId: route.mediaId };
  if (route.type === 'episodePlayer') return { kind: 'show', mediaId: route.showMediaId };
  return null;
}

/** What a player route plays, or null for other routes. */
export function playableForRoute(route: AppRoute): PlayableRef | null {
  if (route.type === 'moviePlayer') return { kind: 'movie', mediaId: route.mediaId };
  if (route.type === 'episodePlayer')
    return {
      kind: 'episode',
      showMediaId: route.showMediaId,
      seasonNumber: route.seasonNumber,
      episodeNumber: route.episodeNumber,
    };
  return null;
}

/**
 * The title on screen. Browsing shows the focused card; details and player show the routed
 * title, falling back to the card that opened it while the routed title loads.
 */
export function selectedMediaFor(
  route: AppRoute,
  routeMedia: MediaDto | null,
  browseSelection: MediaDto | null
): MediaDto | null {
  if (viewForRoute(route) === 'browse') return browseSelection;
  if (routeMedia) return routeMedia;
  const title = routeTitle(route);
  const matches =
    browseSelection &&
    title &&
    browseSelection.mediaId === title.mediaId &&
    (browseSelection._type === 'movie') === (title.kind === 'movie');
  return matches ? browseSelection : null;
}

/** Read the routed title, its media card, and for an episode what plays next. */
export function useMediaRoute(route: AppRoute) {
  const view = viewForRoute(route);
  const title = routeTitle(route);
  const playable = useMemo(() => playableForRoute(route), [route]);
  const routedMovie = useGetMovieQuery(title?.kind === 'movie' ? title.mediaId : skipToken);
  const routedShow = useGetShowQuery(title?.kind === 'show' ? title.mediaId : skipToken);
  const routeQuery = title?.kind === 'movie' ? routedMovie : routedShow;

  const titleKind = title?.kind;
  const titleId = title?.mediaId;
  const routeMedia = useMemo(() => {
    const movie = routedMovie.data;
    const show = routedShow.data;
    if (titleKind === 'movie') return movie?.mediaId === titleId ? mediaFromMovie(movie!) : null;
    if (titleKind === 'show') return show?.mediaId === titleId ? mediaFromShow(show!) : null;
    return null;
  }, [routedMovie.data, routedShow.data, titleId, titleKind]);

  const episodeRoute = route.type === 'episodePlayer' ? route : null;
  const currentSeasonQuery = useGetSeasonQuery(
    episodeRoute
      ? { showId: episodeRoute.showMediaId, season: episodeRoute.seasonNumber }
      : skipToken
  );
  // currentData, not data: while a new route loads, data still holds the previous show/season.
  const currentSeason = currentSeasonQuery.currentData;
  const upcomingSeasonNumber = episodeRoute
    ? nextSeasonNumber(routedShow.currentData?.seasons, episodeRoute.seasonNumber)
    : undefined;
  // The next season is only needed once the current one has nothing left to play.
  const nextSeasonQuery = useGetSeasonQuery(
    episodeRoute &&
      currentSeason &&
      !nextEpisodeInSeason(currentSeason, episodeRoute.episodeNumber) &&
      upcomingSeasonNumber !== undefined
      ? { showId: episodeRoute.showMediaId, season: upcomingSeasonNumber }
      : skipToken
  );
  const nextEpisode = episodeRoute
    ? findNextEpisode(episodeRoute, currentSeason, nextSeasonQuery.currentData)
    : null;

  return { view, playable, routeQuery, routeMedia, nextEpisode };
}
