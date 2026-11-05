import { type AppRoute, navigate, useRoute } from '@app/router';
import { useLogoutMutation } from '@features/auth/api/auth.api';
import { homeFeedActions, type RowIntent } from '@features/home-feed/homeFeed.slice';
import { selectEmptyListSlugs } from '@features/home-feed/listPages';
import type { MediaDto } from '@miauflix/backend';
import { Spinner } from '@shared/components';
import { builtForTizen, PALETTE } from '@shared/config/constants';
import { useStableCallback } from '@shared/hooks/useStableCallback';
import { useAppSelector } from '@store/hooks';
import {
  selectAvailableSessions,
  selectCurrentSessionId,
  selectCurrentUser,
  selectIsAdmin,
} from '@store/slices/auth';
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
import styled from 'styled-components';

import { CategoryRow, type CategoryRowHandle } from './components/CategoryRow';
import { HomeSidebar, type SidebarItem } from './components/HomeSidebar';
import { NotificationsMenu } from './components/NotificationsMenu';
import { PlayerView } from './components/PlayerView';
import { PreparedMediaDetails, PreparedMediaHero } from './components/PreparedViews';
import { ProfileMenu } from './components/ProfileMenu';
import { TraktModal } from './components/TraktModal';
import { useFocusPrefetch } from './hooks/useFocusPrefetch';
import { useHomeArtwork } from './hooks/useHomeArtwork';
import { useHomeFeed } from './hooks/useHomeFeed';
import { useHomeNavigation } from './hooks/useHomeNavigation';
import { useHomeNotifications } from './hooks/useHomeNotifications';
import { useHomePreparation } from './hooks/useHomePreparation';
import { useIdleRowWarmup } from './hooks/useIdleRowWarmup';
import { useIntroReadiness } from './hooks/useIntroReadiness';
import { useMediaBoxSizes } from './hooks/useMediaBoxSizes';
import { selectedMediaFor, useMediaRoute } from './hooks/useMediaRoute';
import { useRealtimeInterest } from './hooks/useRealtimeInterest';
import { useRestedRow } from './hooks/useRestedRow';
import { useSessionChange } from './hooks/useSessionChange';
import { useSmoothScroller } from './hooks/useSmoothScroller';
import { useTraktPrompt } from './hooks/useTraktPrompt';
import { CONTINUE_CATEGORY } from './home-feed';
import { homeMountedRows, homeRowLoadState, WARM_ROWS } from './home-layout';
import { getMediaTitle } from './media.utils';
import { notificationPlayable } from './notification-copy';
import { subtitleLanguageForMedia } from './subtitle-language';

// Absolute, not fixed: a fixed element is its own stacking context, which would keep the rail
// below the app logo. Nothing above Home scrolls, so both fill the viewport.
const PageContainer = styled.main`
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #000;
  color: ${PALETTE.text.primary};
  outline: none;
`;

const Content = styled.div<{ $margin: number }>`
  position: absolute;
  inset: 42vh 0 0;
  z-index: 2;
  /* On the TV the rows move on a transform transition inside it (see SmoothScrollerOptions):
     scrolling lays out every mounted row on every frame. */
  overflow: ${builtForTizen ? 'hidden' : 'hidden auto'};
  ${builtForTizen ? 'will-change: transform;' : ''}
  padding: 6vh ${({ $margin }) => $margin}px 8vh;
  mask-image: linear-gradient(180deg, transparent 5vh, #000 8vh);
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

/**
 * Full height of every row; only the mounted rows are rendered, each at its own offset (inline
 * styles: a styled-components prop would add a CSS class per distinct offset).
 */
const Rows = styled.div`
  position: relative;
  ${builtForTizen ? 'will-change: transform;' : ''}
`;

const RowSlot = styled.div`
  position: absolute;
  inset-inline: 0;
`;

/**
 * A row in its slot. Memoized whole: a move re-renders Home, and every slot's wrapper re-renders
 * with it (a new `style` each time) even though only the moved row changed; on a TV each styled
 * wrapper costs about a millisecond.
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
    <RowSlot style={{ top }}>
      <CategoryRow ref={rowRef} {...row} />
    </RowSlot>
  );
});

const FullPageState = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${PALETTE.text.muted};
`;

interface HomePageProps {
  route?: AppRoute;
  /** Keep browser interaction and focus disabled while Home is preloading behind the intro. */
  interactive?: boolean;
  /** Signal that the initial row, selected hero, and artwork are ready for the intro. */
  onHydrated?: () => void;
}

const FALLBACK_HOME_ROUTE: AppRoute = { type: 'home' };

/** Browse, details and player screens; each concern lives in its own hook. */
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
  const availableSessions = useSelector(selectAvailableSessions);
  const isAdmin = useAppSelector(selectIsAdmin);
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
  // The notifications panel shows while the rail's bell is highlighted or the panel is in use.
  const region = useSelector((state: RootState) => state.homeNavigation.activeRegion);
  const [sidebarItem, setSidebarItem] = useState<SidebarItem>('search');
  const sidebarActive = interactive && !trakt.open && region === 'sidebar';
  const notificationsFocused = interactive && !trakt.open && region === 'notifications';
  const notificationsVisible =
    browsing && ((sidebarActive && sidebarItem === 'notifications') || notificationsFocused);
  const notifications = useHomeNotifications(sessionId, notificationsVisible);
  // Likewise the profile panel, beside the rail's avatar.
  const profileMenuFocused = interactive && !trakt.open && region === 'profileMenu';
  const profileMenuVisible =
    browsing && ((sidebarActive && sidebarItem === 'profile') || profileMenuFocused);
  const { mediaWidth, mediaPerPage, gap, margin, peekWidth, rowHeight } = useMediaBoxSizes();
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
  const scrollToRow = useCallback(
    (categoryIndex: number) => content.scrollTo(categoryIndex * rowHeight),
    [content, rowHeight]
  );
  const navigation = useHomeNavigation({
    route: activeRoute,
    view,
    playable,
    enabled: interactive && !trakt.open,
    sessionId,
    categories: displayCategories,
    requestNextPage: feed.requestNextPage,
    onBrowseSelection: setBrowseSelection,
    onRowFocus: scrollToRow,
  });
  const { activeRegion, selectedByCategory, rowRefs } = navigation;
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
    () => homeRowLoadState(loadAnchor, displayCategories.length, warmUntil),
    [loadAnchor, displayCategories.length, warmUntil]
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
        // The focused row itself left: focus the row now in its place, or the last row.
        const next = Math.min(activeCategory, displayCategories.length - 1);
        const slug = displayCategories[next]!.slug;
        followedRow.current = { categories: displayCategories, slug };
        if (next !== activeCategory) dispatch(homeNavigationActions.setActiveCategory(next));
        content.scrollTo(next * rowHeight, { instant: true });
        if (browsing && activeRegion === 'carousel') {
          rowRefs.current.get(next)?.focusIndex(selectedByCategory[slug] ?? 0);
        }
        return;
      }
    }
    followedRow.current = {
      categories: displayCategories,
      slug: displayCategories[activeCategory]?.slug,
    };
    // Only a change of rows moves the focus; the region and selections are read as they are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, content, dispatch, displayCategories, rowHeight]);
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
  // The sidebar is memoized: stable callbacks keep row moves from re-rendering it.
  const onSidebarAction = useStableCallback(navigation.onSidebarAction);
  const onSidebarSettings = useStableCallback(navigation.openSettings);
  const onSidebarSearch = useStableCallback(navigation.openSearch);
  const [logout] = useLogoutMutation();
  const onEnterProfile = useStableCallback(() =>
    dispatch(homeNavigationActions.setActiveRegion('profileMenu'))
  );
  /** Leave Home for a profile screen; coming back, the rail (not the panel) has the keyboard. */
  const openProfileScreen = (route: AppRoute) => {
    dispatch(homeNavigationActions.setActiveRegion('sidebar'));
    navigate(route, { parent: { type: 'home' } });
  };
  const sidebarProfile = useMemo(
    () => (sessionId && currentUser ? { session: sessionId, user: currentUser } : null),
    [currentUser, sessionId]
  );
  const onSidebarHover = useStableCallback(() =>
    dispatch(homeNavigationActions.setActiveRegion('sidebar'))
  );
  const onEnterNotifications = useStableCallback(() =>
    dispatch(homeNavigationActions.setActiveRegion('notifications'))
  );
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
      <PageContainer>
        <FullPageState>
          <Spinner text="Loading categories..." size={32} />
        </FullPageState>
      </PageContainer>
    );
  }
  if (view === 'browse' && feed.failed) {
    return (
      <PageContainer>
        <FullPageState>Failed to load categories.</FullPageState>
      </PageContainer>
    );
  }

  return (
    <PageContainer ref={navigation.attachPage} tabIndex={-1}>
      <div inert={trakt.open} style={{ display: 'contents' }}>
        {view === 'browse' ? (
          <>
            <PreparedMediaHero
              media={selectedMedia}
              preparationInputs={preparationInputs}
              onReady={onHeroReady}
            />
            <Content
              ref={builtForTizen ? undefined : content.ref}
              $margin={margin}
              onScroll={builtForTizen ? undefined : handleContentScroll}
            >
              <Rows
                ref={builtForTizen ? content.ref : undefined}
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
                      selectedIndex={selectedByCategory[category.slug] ?? 0}
                      onSelectionChange={callbacksForRow(category.slug, index).onSelectionChange}
                      loadIntent={
                        rowLoadState.visible.has(index)
                          ? 'visible'
                          : rowLoadState.prefetch.has(index) || rowLoadState.warm.has(index)
                            ? 'prefetch'
                            : 'dormant'
                      }
                      visible={rowLoadState.visible.has(index)}
                      warm={rowLoadState.warm.has(index)}
                      mediaWidth={mediaWidth}
                      mediaPerPage={mediaPerPage}
                      gap={gap}
                      peekWidth={peekWidth}
                      isCurrentRow={activeCategory === index}
                      onDataReady={onRowReady}
                      active={
                        interactive &&
                        !trakt.open &&
                        activeRegion === 'carousel' &&
                        activeCategory === index
                      }
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
              </Rows>
            </Content>
            <HomeSidebar
              active={sidebarActive}
              expanded={notificationsVisible || profileMenuVisible}
              showSettings={isAdmin}
              onAction={onSidebarAction}
              onHover={onSidebarHover}
              onSettings={onSidebarSettings}
              onSearch={onSidebarSearch}
              profile={sidebarProfile}
              onEnterProfile={onEnterProfile}
              onEnterNotifications={onEnterNotifications}
              onSelectedChange={setSidebarItem}
              unreadCount={notifications.unreadCount}
              hasNotifications={
                notifications.unreadCount > 0 ||
                notifications.hasRead ||
                notifications.unread.items.length > 0
              }
            />
          </>
        ) : view === 'details' && selectedMedia ? (
          <PreparedMediaDetails
            ref={navigation.detailsRef}
            media={selectedMedia}
            onBack={navigation.returnToBrowse}
            onWatch={navigation.openPlayer}
            preparationInputs={preparationInputs}
          />
        ) : view === 'details' ? (
          <FullPageState role="status">
            {routeQuery.isError ? (
              <div>
                <p>Unable to load this title.</p>
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
          </FullPageState>
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
      {notificationsVisible && (
        <NotificationsMenu
          unread={notifications.unread}
          read={notifications.read}
          unreadCount={notifications.unreadCount}
          hasRead={notifications.hasRead}
          showRead={notifications.showRead}
          focused={notificationsFocused}
          railExpanded
          onToggleShowRead={notifications.toggleShowRead}
          onMarkAllRead={notifications.markAllRead}
          onOpen={notification => {
            if (!notification.readAt) notifications.markRead(notification.id);
            const target = notificationPlayable(notification);
            if (target) navigation.openPlayer(target, { type: 'home' });
            else
              navigate(
                { type: 'showDetails', mediaId: notification.mediaId },
                { parent: { type: 'home' } }
              );
          }}
          onExit={() => dispatch(homeNavigationActions.setActiveRegion('sidebar'))}
          onPointerEnter={() => dispatch(homeNavigationActions.setActiveRegion('notifications'))}
          onPointerLeave={() => navigation.onSidebarAction('right')}
        />
      )}
      {profileMenuVisible && sidebarProfile && (
        <ProfileMenu
          profile={sidebarProfile}
          focused={profileMenuFocused}
          railExpanded
          onSwitch={() => openProfileScreen({ type: 'profiles' })}
          onEdit={() => openProfileScreen({ type: 'editProfile', userId: sidebarProfile.user.id })}
          onLogout={() => {
            // Who's watching (or sign-in, with no other profile) takes over once it is gone:
            // every session of this profile on the device ends, or it would still be listed.
            dispatch(homeNavigationActions.setActiveRegion('sidebar'));
            for (const { session, user } of availableSessions)
              if (user.id === sidebarProfile.user.id) void logout({ session });
          }}
          onExit={() => dispatch(homeNavigationActions.setActiveRegion('sidebar'))}
          onPointerEnter={() => dispatch(homeNavigationActions.setActiveRegion('profileMenu'))}
          onPointerLeave={() => navigation.onSidebarAction('right')}
        />
      )}
      {interactive && trakt.open && sessionId && (
        <TraktModal sessionId={sessionId} onConnected={trakt.connected} onDismiss={trakt.dismiss} />
      )}
    </PageContainer>
  );
};

export default HomePage;
