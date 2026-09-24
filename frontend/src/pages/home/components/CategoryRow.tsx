import { useGetListQuery } from '@features/media/api/lists.api';
import type { ListDto, MediaDto } from '@miauflix/backend';
import { skipToken } from '@reduxjs/toolkit/query';
import { Spinner } from '@shared/components';
import { PALETTE } from '@shared/config/constants';
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

const PAGE_SIZE = 20;

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

const ScrollContainer = styled.div<{ $gap: number }>`
  position: relative;
  display: flex;
  gap: ${({ $gap }) => $gap}px;
  overflow-x: auto;
  overflow-y: visible;
  padding: 0.8vh 0.5vh 1.4vh;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
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
  nearby: boolean;
  mediaWidth: number;
  mediaPerPage: number;
  gap: number;
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
    mediaPerPage,
    mediaWidth,
    onActive,
    onSelect,
  },
  forwardedRef
) {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [page, setPage] = useState(() => Math.floor(Math.max(0, initialIndex) / PAGE_SIZE));
  const current = useGetListQuery(
    nearby ? { category: category.slug, page, limit: PAGE_SIZE } : skipToken
  );
  const total = current.currentData?.total ?? current.data?.total ?? 0;
  const radius = mediaPerPage + 4;
  const first = Math.max(0, selectedIndex - radius);
  const last = Math.min(total - 1, selectedIndex + radius);
  const previousPage = useGetListQuery(
    nearby && page > 0 && first < page * PAGE_SIZE
      ? { category: category.slug, page: page - 1, limit: PAGE_SIZE }
      : skipToken
  );
  const nextPage = useGetListQuery(
    nearby && (page + 1) * PAGE_SIZE < total && last >= (page + 1) * PAGE_SIZE
      ? { category: category.slug, page: page + 1, limit: PAGE_SIZE }
      : skipToken
  );
  const cardRefs = useRef(new Map<number, HTMLButtonElement>());
  const rowRef = useRef<HTMLElement>(null);
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
        selectIndex(selectedIndex - 1);
        return { type: 'handled' };
      }
      if (action === 'right' && selectedIndex < total - 1) {
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
    if (!active || !shouldFocus.current) return;
    const card = cardRefs.current.get(selectedIndex);
    if (!card) return;
    shouldFocus.current = false;
    card.focus({ preventScroll: true });
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
    card.scrollIntoView({ behavior, block: 'nearest', inline: 'nearest' });
    rowRef.current?.scrollIntoView({ behavior, block: 'nearest' });
  }, [active, categoryIndex, mediaByIndex, onActive, selectedIndex]);

  useEffect(() => {
    if (current.currentData && selectedIndex >= current.currentData.total) {
      selectIndex(Math.max(0, current.currentData.total - 1), false);
    }
  }, [current.currentData, selectIndex, selectedIndex]);

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
  const step = mediaWidth + gap;

  return (
    <RowContainer ref={rowRef} aria-labelledby={`category-${category.slug}`}>
      <CategoryTitle id={`category-${category.slug}`}>{category.name}</CategoryTitle>
      <ScrollContainer $gap={gap}>
        {first > 0 && <Spacer $width={first * step - gap} />}
        {indices.map(index => {
          const media = mediaByIndex.get(index);
          return media ? (
            <MediaCard
              key={`${media._type}-${media.id}`}
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
      </ScrollContainer>
    </RowContainer>
  );
});
