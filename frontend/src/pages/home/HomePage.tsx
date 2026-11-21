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
import { ErrorNotice } from '@shared/components';
import { builtForTizen, glRowsEnabled, glTuningOverride } from '@shared/config/constants';
import { getTvGlTextureBudget } from '@shared/config/tv-profile';
import {
  Button,
  EmptyState,
  GlFocusAnchor,
  Message,
  ProgressSpinner,
  SurfaceContextProvider,
} from '@shared/design-system';
import { tileMetrics } from '@shared/design-system/collection-tile/collectionTile.metrics';
import {
  easeRowSlide,
  GlGroup,
  GlLayer,
  GlScroller,
  type GlScrollerHandle,
  GlSurface,
  glSurfaceSupported,
  type GlTuning,
  useGlAvailable,
  useGlBackendReady,
} from '@shared/design-system/gl';
import { useStableCallback } from '@shared/hooks/useStableCallback';
import { getMediaTitle } from '@shared/lib/media.utils';
import { FocusGroup, FocusScope, type InputKind, NavigationProvider } from '@shared/navigation';
import { selectCurrentSessionId, selectCurrentUser } from '@store/slices/auth';
import { homeNavigationActions } from '@store/slices/homeNavigation';
import type { AppDispatch, RootState } from '@store/store';
import {
  type ComponentProps,
  type FC,
  memo,
  type Ref,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';

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
import { HOME_GL_LAYERS } from './homeGlLayers';
import { homeLayout } from './homeLayout';
import { HOME_NAV } from './homeNav';
import * as styles from './homePage.css';

/** The GL rows' tuning: the TV's texture budget, then any debugging override. */
const glTuning: GlTuning | undefined = builtForTizen
  ? { textureBudget: getTvGlTextureBudget(), ...(glTuningOverride as GlTuning | undefined) }
  : (glTuningOverride as GlTuning | undefined);

/**
 * A row in its slot. Memoized whole: a row change re-renders Home, and every slot's wrapper would
 * re-render with it (a new `style` each time) even though only one row changed. The remembered card
 * is read once, as the row mounts: the row reports every later selection, and passing the
 * remembered one down again would re-render it on each report.
 */
const HomeRow = memo(function HomeRow({
  top,
  rowHeight,
  rowRef,
  initialIndexOf,
  ...row
}: Omit<ComponentProps<typeof CategoryRow>, 'ref' | 'initialIndex'> & {
  top: number;
  rowHeight: number;
  rowRef: Ref<CategoryRowHandle>;
  initialIndexOf: (slug: string) => number;
}) {
  const [initialIndex] = useState(() => initialIndexOf(row.category.slug));
  return (
    <div className={styles.rowSlot} style={{ top }}>
      <GlGroup y={top} height={rowHeight}>
        <CategoryRow ref={rowRef} initialIndex={initialIndex} {...row} />
      </GlGroup>
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

/**
 * With the WebGL rows, browsing Home waits for the renderer's chunk (preloaded at startup) as a
 * whole: its first focus looks for the rows, which mount inside the surface.
 */
const HomePage: FC<HomePageProps> = props => (
  <Suspense fallback={null}>
    <HomeContent {...props} />
  </Suspense>
);

const HomeContent: FC<HomePageProps> = ({ route, interactive = true, onHydrated }) => {
  // The rows drawn by WebGL; the DOM rows stay (invisible) for focus and semantics.
  // Decided once; a surface that loses its context for good turns it off (the DOM rows remount)
  const [glWanted] = useState(() => glRowsEnabled && glSurfaceSupported());
  const glRows = useGlAvailable() && glWanted;
  const dispatch = useDispatch<AppDispatch>();
  const currentRoute = useRoute();
  const activeRoute = route ?? currentRoute ?? FALLBACK_HOME_ROUTE;
  const sessionId = useSelector(selectCurrentSessionId);
  const currentUser = useSelector(selectCurrentUser);
  const activeCategory = useSelector((state: RootState) => state.homeNavigation.activeCategory);

  const { view, playable, routeQuery, routeMedia, nextEpisode } = useMediaRoute(activeRoute);
  const browsing = view === 'browse';
  // Only the rows need the renderer: details and the player don't wait for its chunk
  useGlBackendReady(glRows && browsing);
  const [browseSelection, setBrowseSelection] = useState<MediaDto | null>(null);
  useSessionChange(sessionId, () => setBrowseSelection(null));
  const selectedMedia = selectedMediaFor(activeRoute, routeMedia, browseSelection);

  const trakt = useTraktPrompt({
    enabled: interactive && browsing,
    sessionId,
    userId: currentUser?.id,
  });
  const { geometry, margin, rowHeight, windowWidth, windowHeight } = useMediaBoxSizes();
  const layout = homeLayout({ width: windowWidth, height: windowHeight }, geometry);
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
  const glScroller = useRef<GlScrollerHandle>(null);
  const scrollRows = useCallback(
    (target: number, options?: { instant?: boolean }) => {
      if (glScroller.current) glScroller.current.scrollTo(target, options);
      else content.scrollTo(target, options);
    },
    [content]
  );
  const navigation = useHomeNavigation({
    route: activeRoute,
    view,
    playable,
    enabled: interactive && !trakt.open,
    onBrowseSelection: setBrowseSelection,
  });
  // Read when a row mounts, not subscribed: each row's report would re-render Home
  const store = useStore<RootState>();
  const initialIndexOf = useCallback(
    (slug: string) => store.getState().homeNavigation.selectedByCategory[slug] ?? 0,
    [store]
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
    const position = glScroller.current ? glScroller.current.position() : content.position();
    setFirstShownRow(Math.floor(position / rowHeight));
  }, [content, publishInterestAfterScroll, rowHeight]);
  contentRest.current = () => {
    handleContentScroll();
    rowsRested();
  };
  // The rows' height changed (a resize): the focused row's offset with it, so the rows jump to it
  // (the GL scroller keeps its target in px, and the focus outline stays where rows rest)
  const scrolledRowHeight = useRef(rowHeight);
  useEffect(() => {
    if (scrolledRowHeight.current === rowHeight) return;
    scrolledRowHeight.current = rowHeight;
    scrollRows(activeCategory * rowHeight, { instant: true });
  }, [activeCategory, rowHeight, scrollRows]);
  // Back on the rows (from details or the player): the GL scroller is a new one, at the top until
  // told otherwise; it starts on the focused row
  useEffect(() => {
    if (glRows && browsing) scrollRows(activeCategory * rowHeight, { instant: true });
    // Only on arriving: later moves are the focus's
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glRows, browsing]);
  // The DOM rows took over from the GL ones: bring the focused row into view there
  const wasGlRows = useRef(glRows);
  useEffect(() => {
    if (wasGlRows.current && !glRows)
      content.scrollTo(activeCategory * rowHeight, { instant: true });
    wasGlRows.current = glRows;
  }, [activeCategory, content, glRows, rowHeight]);
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
        scrollRows(index * rowHeight, { instant: true });
        return;
      }
      if (index < 0 && displayCategories.length) {
        // The focused row itself left: the row now in its place, or the last row.
        const next = Math.min(activeCategory, displayCategories.length - 1);
        const slug = displayCategories[next]!.slug;
        followedRow.current = { categories: displayCategories, slug };
        if (next !== activeCategory) dispatch(homeNavigationActions.setActiveCategory(next));
        // The navigation layer moves focus to that row too
        scrollRows(next * rowHeight, { instant: true });
        return;
      }
    }
    followedRow.current = {
      categories: displayCategories,
      slug: displayCategories[activeCategory]?.slug,
    };
  }, [activeCategory, dispatch, displayCategories, rowHeight, scrollRows]);
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
    scrollRows(index * rowHeight, input === 'key' ? undefined : { instant: true });
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

  const hero = (
    <PreparedMediaHero
      media={selectedMedia}
      preparationInputs={preparationInputs}
      onReady={onHeroReady}
    />
  );
  const rowsContent = (
    <div
      ref={builtForTizen ? undefined : content.ref}
      className={glRows ? styles.contentGl : builtForTizen ? styles.contentTv : styles.contentWeb}
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
          // Room for the last row to scroll to the top like the others: stopped short, the row
          // above it showed under the fade
          style={{
            height: Math.max(
              displayCategories.length * rowHeight,
              (displayCategories.length - 1) * rowHeight + layout.rowsViewport
            ),
          }}
        >
          {mountedRows.map(index => {
            const category = displayCategories[index];
            return (
              <HomeRow
                key={category.slug}
                top={index * rowHeight}
                rowHeight={rowHeight}
                rowRef={callbacksForRow(category.slug, index).ref}
                category={category}
                categoryIndex={index}
                initialIndexOf={initialIndexOf}
                onSelectionChange={callbacksForRow(category.slug, index).onSelectionChange}
                loadIntent={
                  rowLoadState.visible.has(index)
                    ? 'visible'
                    : rowLoadState.prefetch.has(index) || rowLoadState.warm.has(index)
                      ? 'prefetch'
                      : 'dormant'
                }
                visible={rowLoadState.visible.has(index)}
                geometry={geometry}
                isCurrentRow={activeCategory === index}
                onDataReady={onRowReady}
                onActive={onRowActive}
                onInterest={publishInterestAfterScroll}
                onMediaLoaded={onRowMediaLoaded}
                progress={progressEntries}
                mediaOverride={category.slug === CONTINUE_CATEGORY.slug ? continueMedia : undefined}
                onSelect={onRowSelect}
              />
            );
          })}
        </div>
      </FocusGroup>
    </div>
  );

  if (view === 'browse' && isLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.fullPageState}>
          <ProgressSpinner size="lg" label="Loading categories…" showLabel />
        </div>
      </main>
    );
  }
  if (view === 'browse' && feed.failed) {
    return (
      <main className={styles.page}>
        <div className={styles.fullPageState}>
          <Message tone="danger" toneLabel="Error">
            Failed to load categories.
          </Message>
        </div>
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
              firstRowSlug={displayCategories[0]?.slug}
              onRowFocus={onRowFocus}
              onSearch={onSidebarSearch}
              onOpenNotification={onOpenNotification}
            >
              {glRows ? (
                <GlSurface
                  className={styles.glCanvas}
                  width={windowWidth}
                  height={windowHeight}
                  prefetch={{ x: geometry.itemWidth * 2, y: rowHeight }}
                  exposeAs={import.meta.env.DEV || glTuningOverride ? '__glRows' : undefined}
                  tuning={glTuning}
                  // Opaque: the page under it is black and every layer is drawn on it
                  background="#000000"
                >
                  {/* The hero under the rows: its backdrops live, its shade baked; together
                      what shows through the rows' fade edge */}
                  <GlLayer name={HOME_GL_LAYERS.heroBackground}>
                    <GlLayer name={HOME_GL_LAYERS.heroBackdrops} z={-1} />
                    {/* The hero's height: the texture (and what it fills every frame) ends with it */}
                    <GlLayer baked height={layout.heroHeight}>
                      {hero}
                    </GlLayer>
                  </GlLayer>
                  <GlLayer name={HOME_GL_LAYERS.heroDetails} z={0.5} />
                  {/* The rows from content's top past its padding, faded like its mask
                      (homePage.css.ts) */}
                  <GlScroller
                    ref={glScroller}
                    z={1}
                    clipTop={layout.rowsClipTop}
                    contentTop={layout.rowsContentTop}
                    fade={layout.rowsFade}
                    fadeFrom={HOME_GL_LAYERS.heroBackground}
                    scrollDuration={300}
                    scrollEasing={easeRowSlide}
                    onScrollRest={() => contentRest.current()}
                  >
                    {/* The focused card always rests here: the first row's first whole card */}
                    <GlFocusAnchor
                      layer={HOME_GL_LAYERS.focus}
                      {...layout.focusAnchor}
                      scale={tileMetrics.focusScale}
                    >
                      {rowsContent}
                    </GlFocusAnchor>
                  </GlScroller>
                  <GlLayer name={HOME_GL_LAYERS.focus} z={2} />
                </GlSurface>
              ) : (
                <>
                  {hero}
                  {rowsContent}
                </>
              )}
            </HomeBrowse>
            {/* A Dialog: it contains Home's navigation while open and gives focus back after */}
            {interactive && trakt.open && sessionId && (
              <TraktModal
                sessionId={sessionId}
                onConnected={trakt.connected}
                onDismiss={trakt.dismiss}
              />
            )}
          </NavigationProvider>
        ) : view === 'details' && selectedMedia ? (
          <PreparedMediaDetails
            media={selectedMedia}
            onBack={navigation.returnToBrowse}
            onWatch={navigation.openPlayer}
            preparationInputs={preparationInputs}
          />
        ) : view === 'details' ? (
          <div className={styles.fullPageState}>
            {routeQuery.isError ? (
              <NavigationProvider>
                <SurfaceContextProvider value="solid">
                  <FocusScope autoFocus>
                    <EmptyState
                      heading="Unable to load this title"
                      message={
                        <Message tone="danger" toneLabel="Error" live="assertive">
                          <ErrorNotice
                            error={routeQuery.error}
                            fallback="Unable to load this title."
                          />
                        </Message>
                      }
                      actions={
                        <>
                          <Button navId="title-retry" onClick={() => void routeQuery.refetch()}>
                            Retry
                          </Button>
                          <Button navId="title-back" onClick={navigation.returnToBrowse}>
                            Back to Home
                          </Button>
                        </>
                      }
                    />
                  </FocusScope>
                </SurfaceContextProvider>
              </NavigationProvider>
            ) : (
              <ProgressSpinner size="lg" label="Loading the title…" />
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
    </main>
  );
};

export default HomePage;
