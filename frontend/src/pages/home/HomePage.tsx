import { useGetListsQuery, useGetPopularListsInfiniteQuery } from '@features/media/api/lists.api';
import { mediaApi } from '@features/media/api/media.api';
import type { MediaDto } from '@miauflix/backend';
import { Spinner } from '@shared/components';
import { PALETTE } from '@shared/config/constants';
import { selectCurrentSessionId } from '@store/slices/auth';
import type { AppDispatch, RootState } from '@store/store';
import { type FC, type UIEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';

import { CategoryRow, type CategoryRowHandle } from './components/CategoryRow';
import { HomeSidebar } from './components/HomeSidebar';
import { MediaDetails, type MediaDetailsHandle } from './components/MediaDetails';
import { MediaHero } from './components/MediaHero';
import { useMediaBoxSizes } from './hooks/useMediaBoxSizes';
import { getHomeAction, type HomeAction, type NavigationOutcome } from './homeNavigation';

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

const FullPageState = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${PALETTE.text.muted};
`;

type HomeView = 'browse' | 'details';
type HomeRegion = 'sidebar' | 'carousel' | 'details';

const HomePage: FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const sessionId = useSelector((state: RootState) => selectCurrentSessionId(state));
  const { data: fixedCategories, isLoading, isError } = useGetListsQuery();
  const {
    data: popularPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useGetPopularListsInfiniteQuery({ limit: 20 });
  const categories = useMemo(
    () => [
      ...(fixedCategories ?? []),
      ...(popularPages?.pages.flatMap(page => page.results) ?? []),
    ],
    [fixedCategories, popularPages]
  );
  const { mediaWidth, mediaPerPage, gap, margin, peekWidth } = useMediaBoxSizes();
  const pageRef = useRef<HTMLElement>(null);
  const [view, setView] = useState<HomeView>('browse');
  const [activeRegion, setActiveRegion] = useState<HomeRegion>('carousel');
  const [activeCategory, setActiveCategory] = useState(0);
  const activeCategoryRef = useRef(0);
  const [selectedByCategory, setSelectedByCategory] = useState<Record<string, number>>({});
  const [selectedMedia, setSelectedMedia] = useState<MediaDto | null>(null);
  const rowRefs = useRef(new Map<number, CategoryRowHandle>());
  const detailsRef = useRef<MediaDetailsHandle>(null);
  const pendingBrowseFocus = useRef<{ categoryIndex: number; mediaIndex: number } | null>(null);
  const pendingCategoryAdvance = useRef(false);
  const categoryCount = categories.length;

  const rowLoadState = useMemo(() => {
    const visible = new Set(
      [activeCategory, activeCategory + 1].filter(index => index >= 0 && index < categoryCount)
    );
    const prefetch = Array.from({ length: categoryCount }, (_, index) => index)
      .filter(index => !visible.has(index))
      .sort((left, right) => {
        const distance = (index: number) =>
          index < activeCategory ? activeCategory - index : index - (activeCategory + 1);
        return distance(left) - distance(right) || right - left;
      })
      .slice(0, 4);
    return { visible, prefetch: new Set(prefetch) };
  }, [activeCategory, categoryCount]);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || categories.length === 0) return;
    if (activeCategoryRef.current >= categories.length - 3) void fetchNextPage();
  }, [activeCategory, categories.length, fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    if (!pendingCategoryAdvance.current || activeCategoryRef.current + 1 >= categories.length)
      return;
    pendingCategoryAdvance.current = false;
    activeCategoryRef.current += 1;
    setActiveCategory(activeCategoryRef.current);
  }, [categories.length]);

  const handleContentScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (!hasNextPage || isFetchingNextPage) return;
      const element = event.currentTarget;
      if (
        element.scrollTop + element.clientHeight >=
        element.scrollHeight - element.clientHeight * 2
      )
        void fetchNextPage();
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  );

  useEffect(() => {
    if (!sessionId || !selectedMedia) return;

    if (selectedMedia._type === 'movie') {
      dispatch(mediaApi.util.prefetch('getMovie', selectedMedia.mediaId, { ifOlderThan: 30 }));
    } else {
      dispatch(mediaApi.util.prefetch('getShow', selectedMedia.mediaId, { ifOlderThan: 30 }));
    }
  }, [dispatch, selectedMedia, sessionId]);

  const handleActive = useCallback(
    (categoryIndex: number, mediaIndex: number, media: MediaDto) => {
      activeCategoryRef.current = categoryIndex;
      setActiveCategory(categoryIndex);
      setSelectedMedia(media);
      setSelectedByCategory(previous => {
        const slug = categories?.[categoryIndex]?.slug;
        return slug ? { ...previous, [slug]: mediaIndex } : previous;
      });
    },
    [categories]
  );

  const openDetails = useCallback((media: MediaDto) => {
    setSelectedMedia(media);
    setView('details');
    setActiveRegion('details');
  }, []);

  const handleMoveCategory = useCallback(
    (delta: -1 | 1) => {
      if (!categories?.length) return;
      let nextCategory = activeCategoryRef.current + delta;
      if (nextCategory >= categories.length && delta === 1 && hasNextPage) {
        pendingCategoryAdvance.current = true;
        if (!isFetchingNextPage) void fetchNextPage();
        return;
      }
      let destinationPending = false;
      while (nextCategory >= 0 && nextCategory < categories.length) {
        const row = rowRefs.current.get(nextCategory);
        const selectedIndex = selectedByCategory[categories[nextCategory].slug] ?? 0;
        if (row?.focusIndex(selectedIndex)) break;
        destinationPending = true;
        if (!row || !row.isEmpty()) break;
        nextCategory += delta;
      }
      if (nextCategory < 0 || nextCategory >= categories.length) return;
      if (nextCategory === activeCategoryRef.current) return;
      activeCategoryRef.current = nextCategory;
      setActiveCategory(nextCategory);
      if (destinationPending) {
        pageRef.current?.focus({ preventScroll: true });
      }
    },
    [categories, fetchNextPage, hasNextPage, isFetchingNextPage, selectedByCategory]
  );

  const returnToBrowse = useCallback(() => {
    const categoryIndex = activeCategoryRef.current;
    const category = categories?.[categoryIndex];
    pendingBrowseFocus.current = {
      categoryIndex,
      mediaIndex: category ? (selectedByCategory[category.slug] ?? 0) : 0,
    };
    setView('browse');
    setActiveRegion('carousel');
  }, [categories, selectedByCategory]);

  useEffect(() => {
    if (view !== 'browse') return;
    const pending = pendingBrowseFocus.current;
    if (!pending) return;
    const row = rowRefs.current.get(pending.categoryIndex);
    if (!row) return;
    row.focusIndex(pending.mediaIndex);
    pendingBrowseFocus.current = null;
  }, [view]);

  const handleSidebarAction = useCallback(
    (action: HomeAction): NavigationOutcome => {
      if (action === 'right' || action === 'confirm' || action === 'back') {
        setActiveRegion('carousel');
        const category = categories?.[activeCategory];
        rowRefs.current
          .get(activeCategory)
          ?.focusIndex(category ? (selectedByCategory[category.slug] ?? 0) : 0);
        return { type: 'handled' };
      }
      return { type: 'handled' };
    },
    [activeCategory, categories, selectedByCategory]
  );

  const handleHomeAction = useCallback(
    (action: HomeAction): NavigationOutcome => {
      if (view === 'details') {
        const outcome = detailsRef.current?.handleAction(action) ?? { type: 'ignored' as const };
        if (action === 'back' && outcome.type === 'escape') {
          returnToBrowse();
        }
        return outcome;
      }

      if (activeRegion === 'sidebar') return handleSidebarAction(action);

      const row = rowRefs.current.get(activeCategory);
      const outcome = row?.handleAction(action) ?? { type: 'ignored' as const };
      if (outcome.type === 'escape') {
        if (outcome.direction === 'left') {
          setActiveRegion('sidebar');
        } else if (outcome.direction === 'up' || outcome.direction === 'down') {
          handleMoveCategory(outcome.direction === 'up' ? -1 : 1);
        }
      }
      return outcome;
    },
    [activeCategory, activeRegion, handleMoveCategory, handleSidebarAction, returnToBrowse, view]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const action = getHomeAction(event.key);
      if (!action) return;
      const outcome = handleHomeAction(action);
      if (outcome.type !== 'ignored') event.preventDefault();
    },
    [handleHomeAction]
  );

  if (isLoading) {
    return (
      <PageContainer>
        <FullPageState>
          <Spinner text="Loading categories..." size={32} />
        </FullPageState>
      </PageContainer>
    );
  }
  if (isError || !fixedCategories) {
    return (
      <PageContainer>
        <FullPageState>Failed to load categories.</FullPageState>
      </PageContainer>
    );
  }

  return (
    <PageContainer ref={pageRef} tabIndex={-1} onKeyDown={handleKeyDown}>
      {view === 'browse' ? (
        <>
          <MediaHero media={selectedMedia} />
          <Content $margin={margin} onScroll={handleContentScroll}>
            {categories.map((category, index) => (
              <CategoryRow
                key={category.slug}
                ref={handle => {
                  if (handle) rowRefs.current.set(index, handle);
                  else rowRefs.current.delete(index);
                }}
                category={category}
                categoryIndex={index}
                initialIndex={selectedByCategory[category.slug] ?? 0}
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
                active={activeRegion === 'carousel' && activeCategory === index}
                onActive={handleActive}
                onSelect={openDetails}
              />
            ))}
          </Content>
          <HomeSidebar
            active={activeRegion === 'sidebar'}
            onAction={handleSidebarAction}
            onHover={() => setActiveRegion('sidebar')}
          />
        </>
      ) : selectedMedia ? (
        <MediaDetails ref={detailsRef} media={selectedMedia} />
      ) : null}
    </PageContainer>
  );
};

export default HomePage;
