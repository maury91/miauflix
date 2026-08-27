import { useGetListQuery } from '@features/media/api/lists.api';
import type { ListDto, MediaDto } from '@miauflix/backend';
import { skipToken } from '@reduxjs/toolkit/query';
import { Spinner } from '@shared/components';
import { PALETTE } from '@shared/config/constants';
import {
  forwardRef,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';

import { getNavigationResult } from '../categoryNavigation';
import { MediaCard } from './MediaCard';

const PAGE_SIZE = 20;
const RowContainer = styled.section`
  margin-bottom: 28px;
  scroll-margin-block: 30vh 12vh;
`;
const CategoryTitle = styled.h2`
  margin: 0 0 10px;
  font-size: 1.2rem;
  font-weight: 600;
  text-transform: none;
`;
const ScrollContainer = styled.div<{ $gap: number }>`
  display: flex;
  gap: ${({ $gap }) => $gap}px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 8px 4px 14px;
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
  min-height: 120px;
  color: ${PALETTE.background.disabled};
`;

export interface CategoryRowHandle {
  focusIndex: (index: number) => void;
}
interface CategoryRowProps {
  category: ListDto;
  categoryIndex: number;
  mediaWidth: number;
  mediaPerPage: number;
  gap: number;
  active: boolean;
  onActive: (categoryIndex: number, mediaIndex: number, media: MediaDto) => void;
  onMoveCategory: (categoryIndex: number, mediaIndex: number) => void;
}

export const CategoryRow = forwardRef<CategoryRowHandle, CategoryRowProps>(function CategoryRow(
  { active, category, categoryIndex, gap, mediaPerPage, mediaWidth, onActive, onMoveCategory },
  forwardedRef
) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [page, setPage] = useState(0);
  const current = useGetListQuery({ category: category.slug, page, limit: PAGE_SIZE });
  const totalPages = current.data?.totalPages ?? 0;
  const previous = useGetListQuery(
    page > 0 ? { category: category.slug, page: page - 1, limit: PAGE_SIZE } : skipToken
  );
  const next = useGetListQuery(
    totalPages > page + 1
      ? { category: category.slug, page: page + 1, limit: PAGE_SIZE }
      : skipToken
  );
  const cardRefs = useRef(new Map<number, HTMLButtonElement>());
  const rowRef = useRef<HTMLElement>(null);
  const shouldFocus = useRef(categoryIndex === 0);
  const pendingIndex = useRef<number | null>(categoryIndex === 0 ? 0 : null);
  const total = current.data?.total ?? 0;

  const mediaByIndex = useMemo(() => {
    const result = new Map<number, MediaDto>();
    for (const response of [previous.data, current.data, next.data]) {
      if (response?.page === undefined || response.pageSize === undefined) continue;
      response.results.forEach((media, index) =>
        result.set(response.page! * response.pageSize! + index, media)
      );
    }
    return result;
  }, [current.data, next.data, previous.data]);

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

  useImperativeHandle(forwardedRef, () => ({ focusIndex: index => selectIndex(index) }));

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
    if (!shouldFocus.current) return;
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
    if (current.data && selectedIndex >= current.data.total)
      selectIndex(Math.max(0, current.data.total - 1), false);
  }, [current.data, selectIndex, selectedIndex]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const result = getNavigationResult(event.key, selectedIndex, total);
    if (!result) return;
    event.preventDefault();
    if (result.type === 'media') selectIndex(result.index);
    else onMoveCategory(categoryIndex + result.delta, selectedIndex);
  };

  if (current.isLoading && !current.data)
    return (
      <RowContainer>
        <CategoryTitle>{category.name}</CategoryTitle>
        <State>
          <Spinner text="Loading..." />
        </State>
      </RowContainer>
    );
  if (current.isError && !current.data)
    return (
      <RowContainer>
        <CategoryTitle>{category.name}</CategoryTitle>
        <State>Failed to load content.</State>
      </RowContainer>
    );
  if (!total) return null;

  const radius = mediaPerPage + 4;
  const first = Math.max(0, selectedIndex - radius);
  const last = Math.min(total - 1, selectedIndex + radius);
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
              }}
              onKeyDown={handleKeyDown}
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
