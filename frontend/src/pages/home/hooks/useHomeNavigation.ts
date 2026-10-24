import { type AppRoute, navigate, navigateBack } from '@app/router';
import type { MediaDto, PlayableRef } from '@miauflix/backend';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { homeNavigationActions } from '@store/slices/homeNavigation';
import type { AppDispatch, RootState } from '@store/store';
import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import type { CategoryRowHandle } from '../components/CategoryRow';
import type { MediaDetailsHandle } from '../components/MediaDetails';
import type { HomeAction, NavigationOutcome } from '../homeNavigation';
import type { HomeView } from './useMediaRoute';

/**
 * Holding a direction key scrolls at this pace (ms per card or row) instead of the key-repeat
 * rate, for a steady carousel that the smooth scrolling turns into one continuous motion.
 */
const HELD_KEY_STEP_MS = 90;

/**
 * Remote and keyboard navigation for Home's three screens, moving between them, and where
 * focus lands: rows and the sidebar while browsing, the details page, and Back from the player.
 * Returning to browse refocuses the card that was selected.
 */
export function useHomeNavigation({
  route,
  view,
  playable,
  enabled,
  sessionId,
  categories,
  requestNextPage,
  onBrowseSelection,
  onRowFocus,
}: {
  route: AppRoute;
  view: HomeView;
  playable: PlayableRef | null;
  /** Interactive and no overlay open. */
  enabled: boolean;
  sessionId: string | null;
  categories: ReadonlyArray<{ slug: string }>;
  /** Load more rows; false when there are none. */
  requestNextPage: () => boolean;
  /** The card that becomes the browse selection (focused or opened). */
  onBrowseSelection: (media: MediaDto) => void;
  /** Keyboard navigation moved to this row: bring it into view. */
  onRowFocus: (categoryIndex: number) => void;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const activeRegion = useSelector((state: RootState) => state.homeNavigation.activeRegion);
  const activeCategory = useSelector((state: RootState) => state.homeNavigation.activeCategory);
  const selectedByCategory = useSelector(
    (state: RootState) => state.homeNavigation.selectedByCategory
  );
  const pendingCategoryAdvance = useSelector(
    (state: RootState) => state.homeNavigation.pendingCategoryAdvance
  );
  const pageRef = useRef<HTMLElement | null>(null);
  const rowRefs = useRef(new Map<number, CategoryRowHandle>());
  const detailsRef = useRef<MediaDetailsHandle>(null);
  const pendingBrowseFocus = useRef<{ categoryIndex: number; mediaIndex: number } | null>(null);
  const browseFocusState = useRef({ activeCategory, categories, selectedByCategory, onRowFocus });
  browseFocusState.current = { activeCategory, categories, selectedByCategory, onRowFocus };

  const selectedIndexIn = useCallback(
    (categoryIndex: number) => {
      const category = categories[categoryIndex];
      return category ? (selectedByCategory[category.slug] ?? 0) : 0;
    },
    [categories, selectedByCategory]
  );

  const onCardActive = useCallback(
    (categoryIndex: number, _mediaIndex: number, media: MediaDto) => {
      dispatch(homeNavigationActions.setActiveCategory(categoryIndex));
      onBrowseSelection(media);
    },
    [dispatch, onBrowseSelection]
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

  const moveCategory = useCallback(
    (delta: -1 | 1) => {
      if (!categories.length) return;
      let nextCategory = activeCategory + delta;
      // Past the last loaded row: advance once the next page of rows arrives.
      if (nextCategory >= categories.length && delta === 1 && requestNextPage()) {
        dispatch(homeNavigationActions.setPendingCategoryAdvance(true));
        return;
      }
      // Any other move cancels a pending advance, so it cannot undo this one once rows arrive.
      if (pendingCategoryAdvance) dispatch(homeNavigationActions.setPendingCategoryAdvance(false));
      // Skip rows that loaded empty; stop on a row that is still loading.
      let destinationPending = false;
      while (nextCategory >= 0 && nextCategory < categories.length) {
        const row = rowRefs.current.get(nextCategory);
        if (row?.focusIndex(selectedIndexIn(nextCategory))) break;
        destinationPending = true;
        if (!row || !row.isEmpty()) break;
        nextCategory += delta;
      }
      if (nextCategory < 0 || nextCategory >= categories.length) return;
      if (nextCategory === activeCategory) return;
      dispatch(homeNavigationActions.setActiveCategory(nextCategory));
      onRowFocus(nextCategory);
      // Keep keys working while the destination row mounts its cards.
      if (destinationPending) pageRef.current?.focus({ preventScroll: true });
    },
    [
      activeCategory,
      categories.length,
      dispatch,
      onRowFocus,
      pendingCategoryAdvance,
      requestNextPage,
      selectedIndexIn,
    ]
  );

  useEffect(() => {
    if (!pendingCategoryAdvance || activeCategory + 1 >= categories.length) return;
    dispatch(homeNavigationActions.setPendingCategoryAdvance(false));
    dispatch(homeNavigationActions.setActiveCategory(activeCategory + 1));
    onRowFocus(activeCategory + 1);
  }, [activeCategory, categories.length, dispatch, onRowFocus, pendingCategoryAdvance]);

  const returnToBrowse = useCallback(() => {
    pendingBrowseFocus.current = {
      categoryIndex: activeCategory,
      mediaIndex: selectedIndexIn(activeCategory),
    };
    navigateBack({ type: 'home' });
    dispatch(homeNavigationActions.setActiveRegion('carousel'));
  }, [activeCategory, dispatch, selectedIndexIn]);

  const returnToDetails = useCallback(() => {
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
    (next: PlayableRef) => {
      navigate(
        next.kind === 'movie'
          ? { type: 'moviePlayer', mediaId: next.mediaId }
          : { type: 'episodePlayer', ...next },
        {
          parent: route.type === 'movieDetails' || route.type === 'showDetails' ? route : undefined,
        }
      );
      dispatch(homeNavigationActions.setActiveRegion('player'));
    },
    [dispatch, route]
  );

  const openSettings = useCallback(() => {
    if (sessionId) navigate({ type: 'settings' }, { parent: { type: 'home' } });
  }, [sessionId]);

  // Each screen owns its region; arriving back on browse refocuses the selected card.
  useEffect(() => {
    if (view === 'details') {
      dispatch(homeNavigationActions.setActiveRegion('details'));
      return;
    }
    if (view === 'player') {
      dispatch(homeNavigationActions.setActiveRegion('player'));
      return;
    }
    dispatch(homeNavigationActions.setActiveRegion('carousel'));
    const pending = pendingBrowseFocus.current;
    const { activeCategory, categories, selectedByCategory, onRowFocus } = browseFocusState.current;
    const categoryIndex = pending?.categoryIndex ?? activeCategory;
    const category = categories[categoryIndex];
    const mediaIndex =
      pending?.mediaIndex ?? (category ? (selectedByCategory[category.slug] ?? 0) : 0);
    onRowFocus(categoryIndex);
    const row = rowRefs.current.get(categoryIndex);
    if (!row) return;
    row.focusIndex(mediaIndex);
    pendingBrowseFocus.current = null;
  }, [route, dispatch, view]);

  const onSidebarAction = useCallback(
    (action: HomeAction): NavigationOutcome => {
      if (action === 'right' || action === 'confirm' || action === 'back') {
        dispatch(homeNavigationActions.setActiveRegion('carousel'));
        rowRefs.current.get(activeCategory)?.focusIndex(selectedIndexIn(activeCategory));
      }
      return { type: 'handled' };
    },
    [activeCategory, dispatch, selectedIndexIn]
  );

  const handleAction = useCallback(
    (action: HomeAction): NavigationOutcome => {
      if (view === 'player') {
        return action === 'back' ? (returnToDetails(), { type: 'handled' }) : { type: 'ignored' };
      }
      if (view === 'details') {
        const outcome = detailsRef.current?.handleAction(action) ?? { type: 'ignored' as const };
        if (action === 'back' && outcome.type === 'escape') returnToBrowse();
        return outcome;
      }
      if (activeRegion === 'sidebar') return onSidebarAction(action);
      const outcome = rowRefs.current.get(activeCategory)?.handleAction(action) ?? {
        type: 'ignored' as const,
      };
      if (outcome.type === 'escape') {
        if (outcome.direction === 'left') {
          dispatch(homeNavigationActions.setActiveRegion('sidebar'));
        } else if (outcome.direction === 'up' || outcome.direction === 'down') {
          moveCategory(outcome.direction === 'up' ? -1 : 1);
        }
      }
      return outcome;
    },
    [
      activeCategory,
      activeRegion,
      dispatch,
      moveCategory,
      onSidebarAction,
      returnToBrowse,
      returnToDetails,
      view,
    ]
  );

  // While browsing, a held key repeats far faster than anyone can follow; take one step per
  // HELD_KEY_STEP_MS and swallow the repeats in between.
  const lastStepAt = useRef(0);
  const step = (action: HomeAction) => (event: KeyboardEvent) => {
    const now = performance.now();
    if (view === 'browse' && event.repeat && now - lastStepAt.current < HELD_KEY_STEP_MS)
      return true;
    lastStepAt.current = now;
    return handleAction(action).type !== 'ignored';
  };

  const navigationRef = useKeyboardNavigation({
    enabled,
    onLeft: step('left'),
    onRight: step('right'),
    onUp: step('up'),
    onDown: step('down'),
    onConfirm: () => handleAction('confirm').type !== 'ignored',
    onBack: () => handleAction('back').type !== 'ignored',
  });

  const attachPage = useCallback(
    (node: HTMLElement | null) => {
      pageRef.current = node;
      navigationRef(node);
    },
    [navigationRef]
  );

  return {
    activeRegion,
    activeCategory,
    selectedByCategory,
    rowRefs,
    detailsRef,
    attachPage,
    onCardActive,
    openDetails,
    openPlayer,
    openSettings,
    returnToBrowse,
    returnToDetails,
    onSidebarAction,
  };
}
