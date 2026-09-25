import { useGetListQuery, usePromoteListMediaMutation } from '@features/media/api/lists.api';
import type { ListDto, MediaDto } from '@miauflix/backend';
import { skipToken } from '@reduxjs/toolkit/query';
import { Spinner } from '@shared/components';
import { IS_TV, PALETTE } from '@shared/config/constants';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';

import { type HomeAction, moveIndex, type NavigationOutcome } from '../homeNavigation';
import { MediaCard } from './MediaCard';

import ChevronLeftIcon from '~icons/line-md/chevron-left';
import ChevronRightIcon from '~icons/line-md/chevron-right';

const PAGE_SIZE = 20;
const ALIGNMENT_TOLERANCE = 0.5;

const RowContainer = styled.section`
  margin-bottom: 5vh;
  scroll-margin-block: 7vh 8vh;
`;

const CategoryTitle = styled.h2`
  height: 5vh;
  margin: 0 0 1vh;
  font-size: clamp(1rem, 2.4vh, 1.6rem);
  font-weight: 500;
  text-transform: none;
`;

const CarouselViewport = styled.div<{ $contentWidth: number; $peekWidth: number }>`
  position: relative;
  width: ${({ $contentWidth, $peekWidth }) => $contentWidth + $peekWidth * 2}px;
  margin-inline: ${({ $contentWidth, $peekWidth }) =>
    `calc((100% - ${$contentWidth + $peekWidth * 2}px) / 2)`};
  overflow: hidden;

  &:hover button,
  &:focus-within button {
    opacity: 1;
  }
`;

const ScrollContainer = styled.div<{ $gap: number; $peekWidth: number }>`
  display: flex;
  gap: ${({ $gap }) => $gap}px;
  overflow-x: auto;
  overflow-y: visible;
  padding: 0.8vh ${({ $peekWidth }) => `calc(${$peekWidth}px + 0.5vh)`} 1.4vh;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const EdgeFade = styled.div<{ $side: 'left' | 'right'; $peekWidth: number }>`
  position: absolute;
  z-index: 2;
  inset-block: 0;
  ${({ $side }) => ($side === 'left' ? 'left: 0;' : 'right: 0;')}
  width: ${({ $peekWidth }) => $peekWidth + 28}px;
  pointer-events: none;
  background: ${({ $side }) =>
    $side === 'left'
      ? 'linear-gradient(90deg, #000 0%, rgba(0, 0, 0, 0.82) 20%, transparent 100%)'
      : 'linear-gradient(270deg, #000 0%, rgba(0, 0, 0, 0.82) 20%, transparent 100%)'};
`;

const ArrowButton = styled.button<{ $side: 'left' | 'right' }>`
  position: absolute;
  z-index: 3;
  top: 50%;
  ${({ $side }) => ($side === 'left' ? 'left: 0;' : 'right: 0;')}
  display: grid;
  width: 4.8vh;
  height: 4.8vh;
  padding: 0;
  place-items: center;
  transform: translateY(-50%);
  border: 1px solid rgba(245, 245, 245, 0.25);
  border-radius: 50%;
  background: rgba(10, 13, 15, 0.78);
  color: ${PALETTE.text.primary};
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 140ms ease,
    background 140ms ease,
    border-color 140ms ease;

  &:hover,
  &:focus-visible {
    border-color: ${PALETTE.color.interactive};
    background: rgba(10, 13, 15, 0.96);
    outline: none;
  }

  svg {
    width: 2.8vh;
    height: 2.8vh;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Spacer = styled.div<{ $width: number }>`
  flex: 0 0 ${({ $width }) => Math.max(0, $width)}px;
`;

const State = styled.div`
  display: flex;
  align-items: center;
  min-height: 20vh;
  color: ${PALETTE.text.muted};
`;

export interface CategoryRowHandle {
  focusIndex: (index: number) => boolean;
  isEmpty: () => boolean;
  handleAction: (action: HomeAction) => NavigationOutcome;
  getNavigationContext: () => {
    selected: MediaDto | null;
    left: MediaDto | null;
    right: MediaDto | null;
  };
}

interface CategoryRowProps {
  category: ListDto;
  categoryIndex: number;
  initialIndex: number;
  nearby?: boolean;
  loadIntent?: 'visible' | 'prefetch' | 'dormant';
  visible?: boolean;
  mediaWidth: number;
  mediaPerPage: number;
  gap: number;
  peekWidth: number;
  contentWidth?: number;
  active: boolean;
  onActive: (categoryIndex: number, mediaIndex: number, media: MediaDto) => void;
  onSelect: (media: MediaDto) => void;
}

export const CategoryRow = forwardRef<CategoryRowHandle, CategoryRowProps>(function CategoryRow(
  {
    active,
    category,
    categoryIndex,
    gap,
    initialIndex,
    nearby,
    loadIntent,
    visible = false,
    mediaPerPage,
    mediaWidth,
    peekWidth,
    contentWidth = mediaWidth * mediaPerPage + gap * (mediaPerPage - 1),
    onActive,
    onSelect,
  },
  forwardedRef
) {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [page, setPage] = useState(() => Math.floor(Math.max(0, initialIndex) / PAGE_SIZE));
  const [scrollLeft, setScrollLeft] = useState(0);
  const [alignmentRequest, setAlignmentRequest] = useState(0);
  const effectiveLoadIntent = loadIntent ?? (nearby ? 'visible' : 'dormant');
  const current = useGetListQuery(
    effectiveLoadIntent !== 'dormant'
      ? { category: category.slug, page, limit: PAGE_SIZE, priority: effectiveLoadIntent }
      : skipToken
  );
  const [promoteListMedia] = usePromoteListMediaMutation();
  const total = current.currentData?.total ?? current.data?.total ?? 0;
  const step = mediaWidth + gap;
  const radius = mediaPerPage + 4;
  const first = Math.max(0, selectedIndex - radius);
  const last = Math.min(total - 1, selectedIndex + radius);
  const previousPage = useGetListQuery(
    effectiveLoadIntent !== 'dormant' && page > 0 && first < page * PAGE_SIZE
      ? {
          category: category.slug,
          page: page - 1,
          limit: PAGE_SIZE,
          priority: effectiveLoadIntent,
        }
      : skipToken
  );
  const nextPage = useGetListQuery(
    effectiveLoadIntent !== 'dormant' &&
      (page + 1) * PAGE_SIZE < total &&
      last >= (page + 1) * PAGE_SIZE
      ? {
          category: category.slug,
          page: page + 1,
          limit: PAGE_SIZE,
          priority: effectiveLoadIntent,
        }
      : skipToken
  );
  const cardRefs = useRef(new Map<number, HTMLButtonElement>());
  const rowRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingAlignedIndex = useRef<number | null>(null);
  const shouldFocus = useRef(categoryIndex === 0);
  const pendingIndex = useRef<number | null>(categoryIndex === 0 ? initialIndex : null);

  const mediaByIndex = useMemo(() => {
    const result = new Map<number, MediaDto>();
    for (const response of [previousPage.currentData, nextPage.currentData, current.currentData]) {
      if (response?.page === undefined || response.pageSize === undefined) continue;
      response.results.forEach((media, index) =>
        result.set(response.page! * response.pageSize! + index, media)
      );
    }
    return result;
  }, [current.currentData, nextPage.currentData, previousPage.currentData]);

  const selectIndex = useCallback(
    (requested: number, focus = true) => {
      if (!total) {
        pendingIndex.current = requested;
        shouldFocus.current = focus;
        return;
      }
      const bounded = Math.max(0, Math.min(requested, total - 1));
      shouldFocus.current = focus;
      setSelectedIndex(bounded);
      setPage(Math.floor(bounded / PAGE_SIZE));
    },
    [total]
  );

  const handleAction = useCallback(
    (action: HomeAction): NavigationOutcome => {
      if (action === 'up' || action === 'down') {
        return { type: 'escape', direction: action };
      }
      const outcome = moveIndex(action, selectedIndex, total);
      if (action === 'left' && selectedIndex > 0) {
        pendingAlignedIndex.current = selectedIndex - 1;
        selectIndex(selectedIndex - 1);
        return { type: 'handled' };
      }
      if (action === 'right' && selectedIndex < total - 1) {
        pendingAlignedIndex.current = selectedIndex + 1;
        selectIndex(selectedIndex + 1);
        return { type: 'handled' };
      }
      if (action === 'confirm') {
        const media = mediaByIndex.get(selectedIndex);
        if (media) {
          onSelect(media);
          return { type: 'activate' };
        }
      }
      return outcome;
    },
    [mediaByIndex, onSelect, selectIndex, selectedIndex, total]
  );

  const moveByArrow = useCallback(
    (delta: -1 | 1) => {
      if (!total) return;
      const currentScrollLeft = scrollRef.current?.scrollLeft ?? scrollLeft;
      const position = currentScrollLeft / step;
      const nearestIndex = Math.round(position);
      const isAligned = Math.abs(currentScrollLeft - nearestIndex * step) <= ALIGNMENT_TOLERANCE;
      const requested =
        delta > 0
          ? (isAligned ? nearestIndex : Math.floor(position)) + 1
          : (isAligned ? nearestIndex : Math.ceil(position)) - 1;
      const bounded = Math.max(0, Math.min(requested, total - 1));
      if (
        isAligned &&
        bounded === nearestIndex &&
        (delta < 0 ? bounded === 0 : bounded === total - 1)
      ) {
        return;
      }
      const media = mediaByIndex.get(bounded);
      if (media) onActive(categoryIndex, bounded, media);
      pendingAlignedIndex.current = bounded;
      selectIndex(bounded);
      setAlignmentRequest(request => request + 1);
    },
    [categoryIndex, mediaByIndex, onActive, scrollLeft, selectIndex, step, total]
  );

  const getNavigationContext = useCallback(() => {
    return {
      selected: mediaByIndex.get(selectedIndex) ?? null,
      left: mediaByIndex.get(selectedIndex - 1) ?? null,
      right: mediaByIndex.get(selectedIndex + 1) ?? null,
    };
  }, [mediaByIndex, selectedIndex]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      focusIndex: index => {
        selectIndex(index);
        return total > 0;
      },
      isEmpty: () => current.currentData?.total === 0,
      handleAction,
      getNavigationContext,
    }),
    [current.currentData?.total, getNavigationContext, handleAction, selectIndex, total]
  );

  useEffect(() => {
    if (total && pendingIndex.current !== null) {
      const requested = pendingIndex.current;
      pendingIndex.current = null;
      selectIndex(requested, shouldFocus.current);
    }
  }, [selectIndex, total]);

  useEffect(() => {
    const media = mediaByIndex.get(selectedIndex);
    if (!media) return;
    if (active) onActive(categoryIndex, selectedIndex, media);
    const alignedIndex = pendingAlignedIndex.current;
    if (alignedIndex === null && (!active || !shouldFocus.current)) return;
    const card = cardRefs.current.get(selectedIndex);
    if (!card) return;
    shouldFocus.current = false;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
    pendingAlignedIndex.current = null;
    if (alignedIndex !== null) {
      const targetScrollLeft = alignedIndex * step;
      setScrollLeft(targetScrollLeft);
      if (scrollRef.current && typeof scrollRef.current.scrollTo === 'function') {
        scrollRef.current.scrollTo({ left: targetScrollLeft, behavior });
      }
      if (active) card.focus({ preventScroll: true });
    } else {
      card.focus({ preventScroll: true });
      card.scrollIntoView({ behavior, block: 'nearest', inline: 'nearest' });
    }
    if (active) rowRef.current?.scrollIntoView({ behavior, block: 'nearest' });
  }, [
    active,
    categoryIndex,
    gap,
    mediaByIndex,
    mediaPerPage,
    mediaWidth,
    onActive,
    selectedIndex,
    step,
    total,
    alignmentRequest,
  ]);

  useEffect(() => {
    if (!visible || !current.currentData?.results.length) return;
    const viewportItems = current.currentData.results
      .map((media, index) => ({ media, index: page * PAGE_SIZE + index }))
      .filter(({ index }) => index >= selectedIndex && index < selectedIndex + mediaPerPage)
      .map(({ media }) => ({
        mediaType: media._type === 'movie' ? ('movie' as const) : ('tv' as const),
        mediaId: media.mediaId,
        tier: 'viewport' as const,
      }));
    const visibleItems = current.currentData.results.map(media => ({
      mediaType: media._type === 'movie' ? ('movie' as const) : ('tv' as const),
      mediaId: media.mediaId,
      tier: 'visible' as const,
    }));
    void promoteListMedia({ items: [...visibleItems, ...viewportItems] });
  }, [current.currentData, mediaPerPage, page, promoteListMedia, selectedIndex, visible]);

  useEffect(() => {
    if (current.currentData && selectedIndex >= current.currentData.total) {
      selectIndex(Math.max(0, current.currentData.total - 1), false);
    }
  }, [current.currentData, selectIndex, selectedIndex]);

  if (effectiveLoadIntent === 'dormant') {
    return (
      <RowContainer>
        <CategoryTitle>{category.name}</CategoryTitle>
        <State aria-hidden="true" />
      </RowContainer>
    );
  }
  if ((current.isLoading || current.isFetching) && !current.currentData) {
    return (
      <RowContainer>
        <CategoryTitle>{category.name}</CategoryTitle>
        <State>
          <Spinner text="Loading..." />
        </State>
      </RowContainer>
    );
  }
  if (current.isError && !current.currentData) {
    return (
      <RowContainer>
        <CategoryTitle>{category.name}</CategoryTitle>
        <State>Failed to load content.</State>
      </RowContainer>
    );
  }
  if (!total) return null;

  const indices = Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
  const canMoveLeft = scrollLeft > ALIGNMENT_TOLERANCE;
  const canMoveRight = scrollLeft < (total - 1) * step - ALIGNMENT_TOLERANCE;
  const keyboardTailWidth = Math.max(0, (mediaPerPage - 1) * step - gap);

  return (
    <RowContainer ref={rowRef} aria-labelledby={`category-${category.slug}`}>
      <CategoryTitle id={`category-${category.slug}`}>{category.name}</CategoryTitle>
      <CarouselViewport $contentWidth={contentWidth} $peekWidth={peekWidth}>
        {canMoveLeft && <EdgeFade $side="left" $peekWidth={peekWidth} aria-hidden="true" />}
        {canMoveRight && <EdgeFade $side="right" $peekWidth={peekWidth} aria-hidden="true" />}
        {!IS_TV && canMoveLeft && (
          <ArrowButton
            $side="left"
            type="button"
            aria-label={`Previous ${category.name} items`}
            onClick={() => moveByArrow(-1)}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </ArrowButton>
        )}
        {!IS_TV && canMoveRight && (
          <ArrowButton
            $side="right"
            type="button"
            aria-label={`Next ${category.name} items`}
            onClick={() => moveByArrow(1)}
          >
            <ChevronRightIcon aria-hidden="true" />
          </ArrowButton>
        )}
        <ScrollContainer
          ref={scrollRef}
          $gap={gap}
          $peekWidth={peekWidth}
          data-testid="category-row-scroll-container"
          onScroll={event => setScrollLeft(event.currentTarget.scrollLeft)}
        >
          {first > 0 && <Spacer $width={first * step - gap} />}
          {indices.map(index => {
            const media = mediaByIndex.get(index);
            return media ? (
              <MediaCard
                // Include the logical position so malformed upstream duplicate identities
                // cannot make React reconcile two cards as the same child.
                key={`${media._type}-${media.mediaId}-${index}`}
                ref={node => {
                  if (node) cardRefs.current.set(index, node);
                  else cardRefs.current.delete(index);
                }}
                media={media}
                width={mediaWidth}
                selected={active && index === selectedIndex}
                tabIndex={active && index === selectedIndex ? 0 : -1}
                onFocus={() => {
                  setSelectedIndex(index);
                  setPage(Math.floor(index / PAGE_SIZE));
                  onActive(categoryIndex, index, media);
                }}
                onHover={() => {
                  setSelectedIndex(index);
                  setPage(Math.floor(index / PAGE_SIZE));
                  onActive(categoryIndex, index, media);
                  cardRefs.current.get(index)?.focus({ preventScroll: true });
                }}
                onSelect={() => {
                  // Clicking a card must update the logical selection before opening details;
                  // otherwise Back returns to the row's previous keyboard selection.
                  setSelectedIndex(index);
                  setPage(Math.floor(index / PAGE_SIZE));
                  onActive(categoryIndex, index, media);
                  onSelect(media);
                }}
              />
            ) : (
              <Spacer key={`placeholder-${index}`} $width={mediaWidth} />
            );
          })}
          {last < total - 1 && <Spacer $width={(total - last - 1) * step - gap} />}
          {keyboardTailWidth > 0 && <Spacer $width={keyboardTailWidth} />}
        </ScrollContainer>
      </CarouselViewport>
    </RowContainer>
  );
});
