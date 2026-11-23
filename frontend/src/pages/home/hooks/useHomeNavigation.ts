import { type AppRoute, getRouteParent, navigate, navigateBack } from '@app/router';
import type { MediaDto, PlayableRef } from '@miauwatch/backend';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { homeNavigationActions } from '@store/slices/homeNavigation';
import type { AppDispatch, RootState } from '@store/store';
import { useCallback, useEffect } from 'react';
import { useDispatch, useStore } from 'react-redux';

import type { HomeView } from './useMediaRoute';

/**
 * Browse, details and the player own their navigation. Home handles Back out of details and
 * the player.
 */
export function useHomeNavigation({
  route,
  view,
  playable,
  enabled,
  onBrowseSelection,
}: {
  route: AppRoute;
  view: HomeView;
  playable: PlayableRef | null;
  /** Interactive and no overlay open. */
  enabled: boolean;
  /** The card that becomes the browse selection (focused or opened). */
  onBrowseSelection: (media: MediaDto) => void;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const store = useStore<RootState>();

  const onCardActive = useCallback(
    (categoryIndex: number, _mediaIndex: number, media: MediaDto) => {
      // Every move in a row reports it; an unchanged row would still notify every subscriber.
      // Read at call time: a render-time copy can lag behind a dispatch made since
      if (store.getState().homeNavigation.activeCategory !== categoryIndex)
        dispatch(homeNavigationActions.setActiveCategory(categoryIndex));
      onBrowseSelection(media);
    },
    [dispatch, onBrowseSelection, store]
  );

  const openDetails = useCallback(
    (media: MediaDto) => {
      onBrowseSelection(media);
      navigate(
        media._type === 'movie'
          ? { type: 'movieDetails', mediaId: media.mediaId }
          : { type: 'showDetails', mediaId: media.mediaId },
        { parent: { type: 'home' } }
      );
      dispatch(homeNavigationActions.setActiveRegion('details'));
    },
    [dispatch, onBrowseSelection]
  );

  /** Back to the rows; browse starts on the row and card it remembers. */
  const returnToBrowse = useCallback(() => {
    // Details opened from search return there; everything else returns to Home.
    if (getRouteParent()?.type === 'search') {
      navigateBack({ type: 'search' });
      return;
    }
    navigateBack({ type: 'home' });
    dispatch(homeNavigationActions.setActiveRegion('carousel'));
  }, [dispatch]);

  const returnToDetails = useCallback(() => {
    // A player opened from a Home notification goes back to Home, not to details.
    if (getRouteParent()?.type === 'home') {
      navigateBack({ type: 'home' });
      dispatch(homeNavigationActions.setActiveRegion('carousel'));
      return;
    }
    const parent =
      playable?.kind === 'movie'
        ? { type: 'movieDetails' as const, mediaId: playable.mediaId }
        : playable?.kind === 'episode'
          ? { type: 'showDetails' as const, mediaId: playable.showMediaId }
          : { type: 'home' as const };
    navigateBack(parent);
    dispatch(homeNavigationActions.setActiveRegion('details'));
  }, [dispatch, playable]);

  const openPlayer = useCallback(
    (next: PlayableRef, parent?: AppRoute) => {
      navigate(
        next.kind === 'movie'
          ? { type: 'moviePlayer', mediaId: next.mediaId }
          : { type: 'episodePlayer', ...next },
        {
          parent:
            parent ??
            (route.type === 'movieDetails' || route.type === 'showDetails' ? route : undefined),
        }
      );
      dispatch(homeNavigationActions.setActiveRegion('player'));
    },
    [dispatch, route]
  );

  const openSearch = useCallback(() => {
    navigate({ type: 'search' }, { parent: { type: 'home' } });
  }, []);

  // Each screen owns its region
  useEffect(() => {
    if (view === 'details') dispatch(homeNavigationActions.setActiveRegion('details'));
    else if (view === 'player') dispatch(homeNavigationActions.setActiveRegion('player'));
  }, [dispatch, view]);

  const navigationRef = useKeyboardNavigation({
    enabled: enabled && view !== 'browse',
    onRestoreFocus: () => false,
    onBack: () => {
      if (view === 'player') returnToDetails();
      else returnToBrowse();
      return true;
    },
  });

  return {
    attachPage: navigationRef,
    onCardActive,
    openDetails,
    openPlayer,
    openSearch,
    returnToBrowse,
    returnToDetails,
  };
}
