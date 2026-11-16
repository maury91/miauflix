import { type AppRoute, navigate, useRoute } from '@app/router';
import { homeFeedActions, type RowIntent } from '@features/home-feed/homeFeed.slice';
import { selectEmptyListSlugs } from '@features/home-feed/listPages';
import { useTraktPrompt } from '@features/integrations/hooks/useTraktPrompt';
import { TraktModal } from '@features/integrations/ui/TraktModal';
import type { NotificationItem } from '@features/notifications/api/notifications.api';
import { notificationPlayable } from '@features/notifications/lib/notification-copy';
import { subtitleLanguageForMedia } from '@features/player/lib/subtitle-language';
import { PlayerView } from '@features/player/ui/PlayerView';
import type { MediaDto } from '@miauflix/backend';
import { Spinner } from '@shared/components';
import { builtForTizen } from '@shared/config/constants';
import { useStableCallback } from '@shared/hooks/useStableCallback';
import { getMediaTitle } from '@shared/lib/media.utils';
import { FocusGroup, type InputKind, NavigationProvider } from '@shared/navigation';
import { ErrorNotice } from '@shared/ui/error-notice/ErrorNotice';
import { selectCurrentSessionId, selectCurrentUser } from '@store/slices/auth';
import { homeNavigationActions } from '@store/slices/homeNavigation';
import type { AppDispatch, RootState } from '@store/store';
import {
  type ComponentProps,
  type FC,
  memo,
  type Ref,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { CategoryRow, type CategoryRowHandle } from './components/CategoryRow';
import { HomeBrowse } from './components/HomeBrowse';
import { PreparedMediaDetails, PreparedMediaHero } from './components/PreparedViews';
import { useFocusPrefetch } from './hooks/useFocusPrefetch';
import { useHomeArtwork } from './hooks/useHomeArtwork';
import { useHomeFeed } from './hooks/useHomeFeed';
import { useHomeNavigation } from './hooks/useHomeNavigation';
import { useHomePreparation } from './hooks/useHomePreparation';
import { useIdleRowWarmup } from './hooks/useIdleRowWarmup';
import { useIntroReadiness } from './hooks/useIntroReadiness';
import { useMediaBoxSizes } from './hooks/useMediaBoxSizes';
import { selectedMediaFor, useMediaRoute } from './hooks/useMediaRoute';
import { useRealtimeInterest } from './hooks/useRealtimeInterest';
import { useRestedRow } from './hooks/useRestedRow';
import { useSessionChange } from './hooks/useSessionChange';
import { useSmoothScroller } from './hooks/useSmoothScroller';
import { CONTINUE_CATEGORY } from './home-feed';
import { homeMountedRows, homeRowLoadState, WARM_ROWS } from './home-layout';
import { HOME_NAV } from './homeNav';
import * as styles from './homePage.css';

/**
 * A row in its slot. Memoized whole: a row change re-renders Home, and every slot's wrapper would
 * re-render with it (a new `style` each time) even though only one row changed.
 */
const HomeRow = memo(function HomeRow({
  top,
  rowRef,
  ...row
}: Omit<ComponentProps<typeof CategoryRow>, 'ref'> & {
  top: number;
  rowRef: Ref<CategoryRowHandle>;
}) {
  return (
    <div className={styles.rowSlot} style={{ top }}>
      <CategoryRow ref={rowRef} {...row} />
    </div>
  );
});

interface HomePageProps {
  route?: AppRoute;
  /** Keep browser interaction and focus disabled while Home is preloading behind the intro. */
  interactive?: boolean;
  /** Signal that the initial row, selected hero, and artwork are ready for the intro. */
  onHydrated?: () => void;
}

const FALLBACK_HOME_ROUTE: AppRoute = { type: 'home' };

/** `rows` plus the focused row and its neighbours, ascending. */
const withRowsAround = (rows: number[], activeCategory: number, categoryCount: number) => {
  const around = [activeCategory - 1, activeCategory, activeCategory + 1].filter(
    row => row >= 0 && row < categoryCount && !rows.includes(row)
  );
  return around.length ? [...rows, ...around].sort((left, right) => left - right) : rows;
};

const HomePage: FC<HomePageProps> = ({ route, interactive = true, onHydrated }) => {
  const dispatch = useDispatch<AppDispatch>();
  const currentRoute = useRoute();
  const activeRoute = route ?? currentRoute ?? FALLBACK_HOME_ROUTE;
  const sessionId = useSelector(selectCurrentSessionId);
  const currentUser = useSelector(selectCurrentUser);
  const activeCategory = useSelector((state: RootState) => state.homeNavigation.activeCategory);

  const { view, playable, routeQuery, routeMedia, nextEpisode } = useMediaRoute(activeRoute);
  const browsing = view === 'browse';
  const [browseSelection, setBrowseSelection] = useState<MediaDto | null>(null);
  useSessionChange(sessionId, () => setBrowseSelection(null));
  const selectedMedia = selectedMediaFor(activeRoute, routeMedia, browseSelection);

  const trakt = useTraktPrompt({
    enabled: interactive && browsing,
    sessionId,
    userId: currentUser?.id,
  });
  const { geometry, margin, rowHeight } = useMediaBoxSizes();
  // The hero and the fixed app logo line up with the rows' left edge.
  useEffect(() => {
    document.body.style.setProperty('--home-content-left', `${margin}px`);
    return () => {
      document.body.style.removeProperty('--home-content-left');
    };
  }, [margin]);
  // Rows are a fixed height, so the first row in view follows from the scroll position alone.
  const [firstShownRow, setFirstShownRow] = useState(activeCategory);
  const feed = useHomeFeed({
    browsing,
    sessionId,
    furthestShownRow: Math.max(activeCategory, firstShownRow + 1),
  });
  const { continueMedia, progressEntries, isLoading, isError } = feed;
  // Rows whose list loaded empty leave Home, in the same update that brings the empty list, so
  // they never show "Nothing here yet".
  const emptySlugs = useSelector(selectEmptyListSlugs);
  const displayCategories = useMemo(
    () =>
      emptySlugs.size
        ? feed.displayCategories.filter(category => !emptySlugs.has(category.slug))
        : feed.displayCategories,
    [emptySlugs, feed.displayCategories]
  );
  const subtitleLanguage = subtitleLanguageForMedia(
    selectedMedia,
    progressEntries,
    currentUser?.id
  );

  const contentRest = useRef(() => {});
  const content = useSmoothScroller('y', {
    transform: builtForTizen,
    onRest: builtForTizen ? () => contentRest.current() : undefined,
  });
  const navigation = useHomeNavigation({
    route: activeRoute,
    view,
    playable,
    enabled: interactive && !trakt.open,
    sessionId,
    onBrowseSelection: setBrowseSelection,
  });
  const selectedByCategory = useSelector(
    (state: RootState) => state.homeNavigation.selectedByCategory
  );
  const rowRefs = useRef(new Map<number, CategoryRowHandle>());
  const publishInterestAfterScroll = useRealtimeInterest({
    sessionId,
    rowRefs,
    rowCount: displayCategories.length,
    activeCategory,
    selectedMedia,
    subtitleLanguage,
    view,
  });
  const categorySlugs = useMemo(
    () => displayCategories.map(category => category.slug),
    [displayCategories]
  );
  const { onMediaLoaded } = useHomeArtwork({
    rowSlugs: categorySlugs,
    continueMedia,
    selectedMedia,
    sessionId,
  });
  useFocusPrefetch(selectedMedia, sessionId, progressEntries);
  const preparationInputs = useHomePreparation({
    sessionId,
    selectedMedia,
    view,
    subtitleLanguage,
  });

  // On the TV, rows below are readied while idle, so moving down does not mount them.
  const warmUntil = useIdleRowWarmup(
    builtForTizen && browsing && interactive,
    activeCategory,
    WARM_ROWS
  );
  // On the TV the rows around the focused one mount, unmount and load once the slide between
  // rows has ended (the content's onRest), not during it or on every move of a quick run.
  const { restedRow: loadAnchor, rested: rowsRested } = useRestedRow(activeCategory, builtForTizen);
  const rowLoadState = useMemo(
    // Rows scrolled into view (a wheel or touch scroll moves no focus) load like the focused one
    () => homeRowLoadState(loadAnchor, displayCategories.length, warmUntil, firstShownRow),
    [loadAnchor, displayCategories.length, warmUntil, firstShownRow]
  );
  const { onRowDataReady, onHeroReady } = useIntroReadiness({
    onHydrated,
    sessionId,
    rowLoadState,
    categorySlugs,
    failed: isError,
    listsReady: feed.listsReady,
    progressReady: feed.progressReady,
    selectedMediaId: selectedMedia?.mediaId ?? null,
  });
  const handleContentScroll = useCallback(() => {
    publishInterestAfterScroll();
    setFirstShownRow(Math.floor(content.position() / rowHeight));
  }, [content, publishInterestAfterScroll, rowHeight]);
  contentRest.current = () => {
    handleContentScroll();
    rowsRested();
  };
  const mountedRows = withRowsAround(
    homeMountedRows(loadAnchor, firstShownRow, displayCategories.length, warmUntil),
    activeCategory,
    displayCategories.length
  );
  // A row above the focused one leaving Home moves the rows below it up: follow the focused row.
  const followedRow = useRef({
    categories: displayCategories,
    slug: displayCategories[activeCategory]?.slug,
  });
  useEffect(() => {
    const previous = followedRow.current;
    if (previous.categories !== displayCategories && previous.slug) {
      const index = displayCategories.findIndex(category => category.slug === previous.slug);
      if (index >= 0 && index < activeCategory) {
        followedRow.current = { categories: displayCategories, slug: previous.slug };
        dispatch(homeNavigationActions.setActiveCategory(index));
        content.scrollTo(index * rowHeight, { instant: true });
        return;
      }
      if (index < 0 && displayCategories.length) {
        // The focused row itself left: the row now in its place, or the last row.
        const next = Math.min(activeCategory, displayCategories.length - 1);
        const slug = displayCategories[next]!.slug;
        followedRow.current = { categories: displayCategories, slug };
        if (next !== activeCategory) dispatch(homeNavigationActions.setActiveCategory(next));
        // The navigation layer moves focus to that row too
        content.scrollTo(next * rowHeight, { instant: true });
        return;
      }
    }
    followedRow.current = {
      categories: displayCategories,
      slug: displayCategories[activeCategory]?.slug,
    };
  }, [activeCategory, content, dispatch, displayCategories, rowHeight]);
  /**
   * Focus moved to another row: Home follows it (the hero, the rows that load). A key brings it
   * into view with the slide between rows; the pointer focuses without scrolling; focus placed by
   * the program (on arrival, or after a row left) jumps there.
   */
  const onRowFocus = useStableCallback((slug: string, input: InputKind) => {
    const index = displayCategories.findIndex(category => category.slug === slug);
    if (index < 0) return;
    if (index !== activeCategory) dispatch(homeNavigationActions.setActiveCategory(index));
    if (input === 'pointer') return;
    content.scrollTo(index * rowHeight, input === 'key' ? undefined : { instant: true });
    // Web scroll events refine the visible row. On TV, wait until the slide stops.
    if (!builtForTizen) setFirstShownRow(index);
  });
  // Which lists load is the store's (homeFeedMiddleware): Home says which rows it wants.
  useEffect(() => {
    const wanted: Record<string, RowIntent> = {};
    if (browsing) {
      const want = (indexes: Iterable<number>, intent: RowIntent) => {
        for (const index of indexes) {
          const slug = displayCategories[index]?.slug;
          if (slug && slug !== CONTINUE_CATEGORY.slug && !wanted[slug]) wanted[slug] = intent;
        }
      };
      want(rowLoadState.visible, 'visible');
      want(rowLoadState.prefetch, 'prefetch');
      want(rowLoadState.warm, 'prefetch');
    }
    // Empty lists stay wanted while Home is mounted: released, their cached page would expire
    // and the row come back until it loaded empty again.
    for (const slug of emptySlugs) if (!wanted[slug]) wanted[slug] = 'prefetch';
    dispatch(homeFeedActions.rowsWanted(wanted));
  }, [browsing, dispatch, displayCategories, emptySlugs, rowLoadState]);
  useEffect(() => () => void dispatch(homeFeedActions.rowsWanted({})), [dispatch]);
  // Rows are memoized; stable callbacks keep a move in one row from re-rendering the others
  const onRowActive = useStableCallback(navigation.onCardActive);
  const onRowSelect = useStableCallback(navigation.openDetails);
  const onRowMediaLoaded = useStableCallback(onMediaLoaded);
  const onRowReady = useStableCallback((slug: string) => onRowDataReady(slug));
  // The rail is memoized: stable callbacks keep row moves from re-rendering it.
  const onSidebarSettings = useStableCallback(navigation.openSettings);
  const onSidebarSearch = useStableCallback(navigation.openSearch);
  const onOpenNotification = useStableCallback((notification: NotificationItem) => {
    const target = notificationPlayable(notification);
    if (target) navigation.openPlayer(target, { type: 'home' });
    else
      navigate(
        { type: 'showDetails', mediaId: notification.mediaId },
        { parent: { type: 'home' } }
      );
  });
  const rowCallbacks = useRef(
    new Map<
      string,
      {
        ref: (handle: CategoryRowHandle | null) => void;
        onSelectionChange: (index: number) => void;
      }
    >()
  );
  const callbacksForRow = (slug: string, index: number) => {
    const key = `${slug}:${index}`;
    let callbacks = rowCallbacks.current.get(key);
    if (!callbacks) {
      callbacks = {
        ref: (handle: CategoryRowHandle | null) => {
          if (handle) rowRefs.current.set(index, handle);
          else rowRefs.current.delete(index);
        },
        onSelectionChange: (mediaIndex: number) =>
          dispatch(homeNavigationActions.setCategorySelection({ slug, index: mediaIndex })),
      };
      rowCallbacks.current.set(key, callbacks);
    }
    return callbacks;
  };

  if (view === 'browse' && isLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.fullPageState}>
          <Spinner text="Loading categories..." size={32} />
        </div>
      </main>
    );
  }
  if (view === 'browse' && feed.failed) {
    return (
      <main className={styles.page}>
        <div className={styles.fullPageState}>Failed to load categories.</div>
      </main>
    );
  }

  return (
    <main ref={navigation.attachPage} className={styles.page} tabIndex={-1}>
      <div inert={trakt.open} className={styles.contents}>
        {view === 'browse' ? (
          <NavigationProvider>
            <HomeBrowse
              interactive={interactive && !trakt.open}
              initialRowSlug={displayCategories[activeCategory]?.slug}
              onRowFocus={onRowFocus}
              onSettings={onSidebarSettings}
              onSearch={onSidebarSearch}
              onOpenNotification={onOpenNotification}
            >
              <PreparedMediaHero
                media={selectedMedia}
                preparationInputs={preparationInputs}
                onReady={onHeroReady}
              />
              <div
                ref={builtForTizen ? undefined : content.ref}
                className={builtForTizen ? styles.contentTv : styles.contentWeb}
                onScroll={builtForTizen ? undefined : handleContentScroll}
              >
                <FocusGroup
                  id={HOME_NAV.rows}
                  layout="vertical"
                  // Past the last row loaded, Down waits for the next page of lists
                  more={{ end: feed.hasMoreRows }}
                  onMore={() => {
                    feed.requestNextPage();
                  }}
                >
                  <div
                    ref={builtForTizen ? content.ref : undefined}
                    className={builtForTizen ? styles.rowsTv : styles.rows}
                    style={{ height: displayCategories.length * rowHeight }}
                  >
                    {mountedRows.map(index => {
                      const category = displayCategories[index];
                      return (
                        <HomeRow
                          key={category.slug}
                          top={index * rowHeight}
                          rowRef={callbacksForRow(category.slug, index).ref}
                          category={category}
                          categoryIndex={index}
                          initialIndex={selectedByCategory[category.slug] ?? 0}
                          onSelectionChange={
                            callbacksForRow(category.slug, index).onSelectionChange
                          }
                          loadIntent={
                            rowLoadState.visible.has(index)
                              ? 'visible'
                              : rowLoadState.prefetch.has(index) || rowLoadState.warm.has(index)
                                ? 'prefetch'
                                : 'dormant'
                          }
                          visible={rowLoadState.visible.has(index)}
                          warm={rowLoadState.warm.has(index)}
                          geometry={geometry}
                          isCurrentRow={activeCategory === index}
                          onDataReady={onRowReady}
                          onActive={onRowActive}
                          onInterest={publishInterestAfterScroll}
                          onMediaLoaded={onRowMediaLoaded}
                          progress={progressEntries}
                          mediaOverride={
                            category.slug === CONTINUE_CATEGORY.slug ? continueMedia : undefined
                          }
                          onSelect={onRowSelect}
                        />
                      );
                    })}
                  </div>
                </FocusGroup>
              </div>
            </HomeBrowse>
          </NavigationProvider>
        ) : view === 'details' && selectedMedia ? (
          <PreparedMediaDetails
            media={selectedMedia}
            onBack={navigation.returnToBrowse}
            onWatch={navigation.openPlayer}
            preparationInputs={preparationInputs}
          />
        ) : view === 'details' ? (
          <div className={styles.fullPageState} role="status">
            {routeQuery.isError ? (
              <div>
                <p>
                  <ErrorNotice error={routeQuery.error} fallback="Unable to load this title." />
                </p>
                <button type="button" onClick={() => void routeQuery.refetch()}>
                  Retry
                </button>
                <button type="button" onClick={navigation.returnToBrowse}>
                  Back to Home
                </button>
              </div>
            ) : (
              <Spinner />
            )}
          </div>
        ) : view === 'player' && playable ? (
          <PlayerView
            playable={playable}
            title={selectedMedia ? getMediaTitle(selectedMedia) : 'Selected title'}
            onBack={navigation.returnToDetails}
            nextEpisode={nextEpisode}
            onPlayNext={() => {
              if (nextEpisode) navigation.openPlayer(nextEpisode.playable);
            }}
          />
        ) : null}
      </div>
      {interactive && trakt.open && sessionId && (
        <TraktModal sessionId={sessionId} onConnected={trakt.connected} onDismiss={trakt.dismiss} />
      )}
    </main>
  );
};

export default HomePage;
