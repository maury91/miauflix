import { type AppRoute, useRoute } from '@app/router';
import type { MediaDto } from '@miauflix/backend';
import { Spinner } from '@shared/components';
import { PALETTE } from '@shared/config/constants';
import { selectCurrentSessionId, selectCurrentUser } from '@store/slices/auth';
import { homeNavigationActions } from '@store/slices/homeNavigation';
import type { AppDispatch, RootState } from '@store/store';
import { type FC, useCallback, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';

import { CategoryRow } from './components/CategoryRow';
import { HomeSidebar } from './components/HomeSidebar';
import { MediaDetails } from './components/MediaDetails';
import { MediaHero } from './components/MediaHero';
import { NotificationsMenu } from './components/NotificationsMenu';
import { PlayerView } from './components/PlayerView';
import { TraktModal } from './components/TraktModal';
import { useFocusPrefetch } from './hooks/useFocusPrefetch';
import { useHomeArtwork } from './hooks/useHomeArtwork';
import { useHomeFeed } from './hooks/useHomeFeed';
import { useHomeNavigation } from './hooks/useHomeNavigation';
import { useHomeNotifications } from './hooks/useHomeNotifications';
import { useHomePreparation } from './hooks/useHomePreparation';
import { useIntroReadiness } from './hooks/useIntroReadiness';
import { useMediaBoxSizes } from './hooks/useMediaBoxSizes';
import { selectedMediaFor, useMediaRoute } from './hooks/useMediaRoute';
import { useRealtimeInterest } from './hooks/useRealtimeInterest';
import { useSessionChange } from './hooks/useSessionChange';
import { useSmoothScroller } from './hooks/useSmoothScroller';
import { useTraktPrompt } from './hooks/useTraktPrompt';
import { CONTINUE_CATEGORY } from './home-feed';
import { homeMountedRows, homeRowLoadState } from './home-layout';
import { getMediaTitle } from './media.utils';
import { subtitleLanguageForMedia } from './subtitle-language';

const PageContainer = styled.main`
  position: fixed;
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
  overflow: hidden auto;
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
`;

const RowSlot = styled.div`
  position: absolute;
  inset-inline: 0;
`;

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
const HomePage: FC<HomePageProps> = ({ route, interactive = true, onHydrated }) => {
  const dispatch = useDispatch<AppDispatch>();
  const currentRoute = useRoute();
  const activeRoute = route ?? currentRoute ?? FALLBACK_HOME_ROUTE;
  const sessionId = useSelector((state: RootState) => selectCurrentSessionId(state));
  const currentUser = useSelector((state: RootState) => selectCurrentUser(state));
  const activeCategory = useSelector((state: RootState) => state.homeNavigation.activeCategory);

  const { view, playable, routeQuery, routeMedia, nextEpisode } = useMediaRoute(activeRoute);
  const browsing = view === 'browse';
  const [browseSelection, setBrowseSelection] = useState<MediaDto | null>(null);
  useSessionChange(sessionId, () => setBrowseSelection(null));
  const selectedMedia = selectedMediaFor(activeRoute, routeMedia, browseSelection);

  const notifications = useHomeNotifications(sessionId, browsing);
  const trakt = useTraktPrompt({
    enabled: interactive && browsing,
    sessionId,
    userId: currentUser?.id,
  });
  const { mediaWidth, mediaPerPage, gap, margin, peekWidth, rowHeight } = useMediaBoxSizes();
  // Rows are a fixed height, so the first row in view follows from the scroll position alone.
  const [firstShownRow, setFirstShownRow] = useState(activeCategory);
  const feed = useHomeFeed({
    browsing,
    sessionId,
    furthestShownRow: Math.max(activeCategory, firstShownRow + 1),
  });
  const { displayCategories, continueMedia, progressEntries, isLoading, isError } = feed;
  const subtitleLanguage = subtitleLanguageForMedia(
    selectedMedia,
    progressEntries,
    currentUser?.id
  );

  const content = useSmoothScroller('y');
  const scrollToRow = useCallback(
    (categoryIndex: number) => content.scrollTo(categoryIndex * rowHeight),
    [content, rowHeight]
  );
  const navigation = useHomeNavigation({
    route: activeRoute,
    view,
    playable,
    enabled: interactive && !trakt.open && !notifications.open,
    sessionId,
    categories: displayCategories,
    requestNextPage: feed.requestNextPage,
    onBrowseSelection: setBrowseSelection,
    onRowFocus: scrollToRow,
  });
  const { activeRegion, selectedByCategory, rowRefs } = navigation;
  const publishInterest = useRealtimeInterest({
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
  const preparation = useHomePreparation({ sessionId, selectedMedia, view, subtitleLanguage });

  const rowLoadState = useMemo(
    () => homeRowLoadState(activeCategory, displayCategories.length),
    [activeCategory, displayCategories.length]
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
    publishInterest();
    const scrollTop = content.element.current?.scrollTop ?? 0;
    setFirstShownRow(Math.floor(scrollTop / rowHeight));
  }, [content, publishInterest, rowHeight]);
  const mountedRows = homeMountedRows(activeCategory, firstShownRow, displayCategories.length);

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
            <MediaHero media={selectedMedia} preparation={preparation} onReady={onHeroReady} />
            <Content ref={content.ref} $margin={margin} onScroll={handleContentScroll}>
              <Rows style={{ height: displayCategories.length * rowHeight }}>
                {mountedRows.map(index => {
                  const category = displayCategories[index];
                  return (
                    <RowSlot key={category.slug} style={{ top: index * rowHeight }}>
                      <CategoryRow
                        ref={handle => {
                          if (handle) rowRefs.current.set(index, handle);
                          else rowRefs.current.delete(index);
                        }}
                        category={category}
                        categoryIndex={index}
                        initialIndex={selectedByCategory[category.slug] ?? 0}
                        selectedIndex={selectedByCategory[category.slug] ?? 0}
                        onSelectionChange={mediaIndex =>
                          dispatch(
                            homeNavigationActions.setCategorySelection({
                              slug: category.slug,
                              index: mediaIndex,
                            })
                          )
                        }
                        loadIntent={
                          rowLoadState.visible.has(index)
                            ? 'visible'
                            : rowLoadState.prefetch.has(index)
                              ? 'prefetch'
                              : 'dormant'
                        }
                        visible={rowLoadState.visible.has(index)}
                        mediaWidth={mediaWidth}
                        mediaPerPage={mediaPerPage}
                        gap={gap}
                        peekWidth={peekWidth}
                        isCurrentRow={activeCategory === index}
                        onDataReady={onRowDataReady}
                        active={
                          interactive &&
                          !trakt.open &&
                          activeRegion === 'carousel' &&
                          activeCategory === index
                        }
                        onActive={navigation.onCardActive}
                        onInterest={publishInterest}
                        onMediaLoaded={onMediaLoaded}
                        progress={progressEntries}
                        mediaOverride={
                          category.slug === CONTINUE_CATEGORY.slug ? continueMedia : undefined
                        }
                        onSelect={navigation.openDetails}
                      />
                    </RowSlot>
                  );
                })}
              </Rows>
            </Content>
            <HomeSidebar
              active={
                interactive && !trakt.open && !notifications.open && activeRegion === 'sidebar'
              }
              onAction={navigation.onSidebarAction}
              onHover={() => dispatch(homeNavigationActions.setActiveRegion('sidebar'))}
              onSettings={navigation.openSettings}
              onNotifications={notifications.openNotifications}
              notificationsRef={notifications.buttonRef}
              unreadCount={notifications.query.data?.unreadCount ?? 0}
            />
          </>
        ) : view === 'details' && selectedMedia ? (
          <MediaDetails
            ref={navigation.detailsRef}
            media={selectedMedia}
            onBack={navigation.returnToBrowse}
            onWatch={navigation.openPlayer}
            preparation={preparation}
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
      {view === 'browse' && notifications.open && (
        <NotificationsMenu
          notifications={notifications.query.data?.notifications ?? []}
          loading={notifications.query.isLoading}
          failed={notifications.query.isError}
          sidebarActive={activeRegion === 'sidebar'}
          onClose={notifications.closeNotifications}
          onRetry={() => void notifications.query.refetch()}
          onMarkRead={id => void notifications.markRead(id)}
        />
      )}
      {interactive && trakt.open && sessionId && (
        <TraktModal sessionId={sessionId} onConnected={trakt.connected} onDismiss={trakt.dismiss} />
      )}
    </PageContainer>
  );
};

export default HomePage;
