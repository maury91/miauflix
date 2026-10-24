import { useGetListQuery, usePromoteListMediaMutation } from '@features/media/api/lists.api';
import { useQueueBackdropFocusMutation } from '@features/media/api/media.api';
import type { ListDto, MediaDto, ProgressEntry } from '@miauflix/backend';
import { skipToken } from '@reduxjs/toolkit/query';
import { Spinner } from '@shared/components';
import { IS_TV, PALETTE } from '@shared/config/constants';
import { Button as BaseButton } from '@shared/ui/button/Button';
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';

import { ROW_GAP_VH, ROW_HEIGHT_VH } from '../home-layout';
import { type HomeAction, type NavigationOutcome, resolveCarouselAction } from '../homeNavigation';
import { useSmoothScroller } from '../hooks/useSmoothScroller';
import { imagePreloader, NEARBY } from '../image-preloader';
import { artworkUrl } from '../media.utils';
import { ROW_PAGE_SIZE, rowPagesFor, rowRenderRadius } from '../row-pages';
import { MediaCard } from './MediaCard';

import ChevronLeftIcon from '~icons/line-md/chevron-left';
import ChevronRightIcon from '~icons/line-md/chevron-right';

const VIEWPORT_PROMOTION_DEBOUNCE_MS = 300;

/** Fixed height, whatever the row shows, so Home can place rows without measuring them. */
const RowContainer = styled.section`
  height: ${ROW_HEIGHT_VH - ROW_GAP_VH}vh;
  margin-bottom: ${ROW_GAP_VH}vh;
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

// eslint-disable-next-line no-restricted-syntax -- Existing media/player interaction and TV-scaled chrome; see shared/ui/README.md.
const ArrowButton = styled(BaseButton)<{ $side: 'left' | 'right' }>`
  position: absolute;
  z-index: 3;
  top: 50%;
  ${({ $side }) => ($side === 'left' ? 'left: 0;' : 'right: 0;')}
  display: grid;
  width: 4.8vh;
  height: 4.8vh;
  min-width: 0;
  min-height: 0;
  padding: 0;
  place-items: center;
  transform: translateY(-50%);
  border: 1px solid rgba(245, 245, 245, 0.25);
  border-radius: 50%;
  background: rgba(10, 13, 15, 0.78);
  color: ${PALETTE.text.primary};
  cursor: pointer;
  opacity: 0;
  box-shadow: none;
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

/** Stands in for cards that are not rendered. Sized inline: a styled-components prop would add a
 * CSS class per distinct width. */
const Spacer = ({ width }: { width: number }) => (
  <div style={{ flex: `0 0 ${Math.max(0, width)}px` }} />
);

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
  getInterestWindow: () => {
    media: Array<MediaDto | null>;
    center: number | null;
    visible: number[];
  };
}

interface CategoryRowProps {
  category: ListDto;
  categoryIndex: number;
  initialIndex: number;
  selectedIndex?: number;
  onSelectionChange?: (index: number) => void;
  nearby?: boolean;
  loadIntent?: 'visible' | 'prefetch' | 'dormant';
  visible?: boolean;
  mediaWidth: number;
  mediaPerPage: number;
  gap: number;
  peekWidth: number;
  contentWidth?: number;
  /** The row whose selected media should supply the hero while Home is non-interactive. */
  isCurrentRow: boolean;
  active: boolean;
  onActive: (categoryIndex: number, mediaIndex: number, media: MediaDto) => void;
  onDataReady?: (slug: string) => void;
  onInterest?: () => void;
  onSelect: (media: MediaDto) => void;
  progress?: ProgressEntry[];
  mediaOverride?: MediaDto[];
  onMediaLoaded?: (slug: string, media: MediaDto[]) => void;
}

const mediaRef = (media: MediaDto) => ({
  mediaType: media._type === 'movie' ? ('movie' as const) : ('tv' as const),
  mediaId: media.mediaId,
});

/**
 * A navigable media row. The selected card sits in the leading slot: moving the selection
 * scrolls the row (animated, see smooth-scroll.ts) so the selection lands there. Only the cards
 * around the selection are rendered, and only the list pages around it are loaded (see
 * row-pages.ts). Supplying mediaOverride bypasses list fetching and promotion, including for an
 * empty array.
 */
export const CategoryRow = forwardRef<CategoryRowHandle, CategoryRowProps>(function CategoryRow(
  {
    active,
    category,
    categoryIndex,
    selectedIndex: controlledIndex,
    onSelectionChange,
    gap,
    isCurrentRow,
    initialIndex,
    nearby,
    loadIntent,
    visible = false,
    mediaPerPage,
    mediaWidth,
    peekWidth,
    contentWidth = mediaWidth * mediaPerPage + gap * (mediaPerPage - 1),
    onActive,
    onDataReady,
    onInterest,
    onSelect,
    progress,
    mediaOverride,
    onMediaLoaded,
  },
  forwardedRef
) {
  const [uncontrolledIndex, setUncontrolledIndex] = useState(initialIndex);
  const selectedIndex = controlledIndex ?? uncontrolledIndex;
  const effectiveLoadIntent = loadIntent ?? (nearby ? 'visible' : 'dormant');
  const fetching = !mediaOverride && effectiveLoadIntent !== 'dormant';

  // Data: the selection's page, and the neighbouring page once the selection nears it.
  const pageQuery = (index: number | null) =>
    fetching && index !== null
      ? {
          category: category.slug,
          page: index,
          limit: ROW_PAGE_SIZE,
          priority: effectiveLoadIntent,
        }
      : skipToken;
  const current = useGetListQuery(pageQuery(Math.floor(selectedIndex / ROW_PAGE_SIZE)));
  const total = mediaOverride?.length ?? current.currentData?.total ?? current.data?.total ?? 0;
  const adjacent = useGetListQuery(pageQuery(rowPagesFor(selectedIndex, total).neighbour));

  const mediaByIndex = useMemo(() => {
    if (mediaOverride) return new Map(mediaOverride.map((media, index) => [index, media]));
    const result = new Map<number, MediaDto>();
    for (const response of [adjacent.currentData, current.currentData]) {
      if (response?.page === undefined || response.pageSize === undefined) continue;
      response.results.forEach((media, index) =>
        result.set(response.page! * response.pageSize! + index, media)
      );
    }
    return result;
  }, [adjacent.currentData, current.currentData, mediaOverride]);

  const [promoteListMedia] = usePromoteListMediaMutation();
  const [queueBackdropFocus] = useQueueBackdropFocusMutation();
  const step = mediaWidth + gap;
  const cardRefs = useRef(new Map<number, HTMLButtonElement>());
  const scroller = useSmoothScroller('x');
  /** Set by keyboard and arrow moves: focus the selected card once it is rendered. */
  const wantsFocus = useRef(isCurrentRow);
  /** Bumped to scroll the selection into the leading slot; hover selects without scrolling. */
  const [alignRequest, setAlignRequest] = useState(0);

  const updateSelectedIndex = useCallback(
    (index: number) => {
      if (controlledIndex === undefined) setUncontrolledIndex(index);
      onSelectionChange?.(index);
    },
    [controlledIndex, onSelectionChange]
  );

  /** Select `index` (bounded once the row's size is known) and scroll it into the leading slot. */
  const moveTo = useCallback(
    (index: number, focus = true) => {
      updateSelectedIndex(total ? Math.max(0, Math.min(index, total - 1)) : Math.max(0, index));
      wantsFocus.current = focus;
      setAlignRequest(request => request + 1);
    },
    [total, updateSelectedIndex]
  );

  // Scroll the selection into the leading slot (instantly the first time, see useSmoothScroller).
  useLayoutEffect(() => {
    if (total) scroller.scrollTo(Math.min(selectedIndex, total - 1) * step);
    // Only explicit moves (and the row's size or card size changing) scroll the row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alignRequest, total, step]);

  useEffect(() => {
    const media = mediaByIndex.get(selectedIndex);
    if (!media) return;
    if (isCurrentRow) onActive(categoryIndex, selectedIndex, media);
    if (!active || !wantsFocus.current) return;
    const card = cardRefs.current.get(selectedIndex);
    if (!card) return;
    wantsFocus.current = false;
    card.focus({ preventScroll: true });
  }, [active, alignRequest, categoryIndex, isCurrentRow, mediaByIndex, onActive, selectedIndex]);

  const handleAction = useCallback(
    (action: HomeAction): NavigationOutcome => {
      const command = resolveCarouselAction(
        action,
        selectedIndex,
        total,
        mediaByIndex.get(selectedIndex) ?? null
      );
      if (command.nextIndex !== undefined) moveTo(command.nextIndex);
      if (command.activation) onSelect(command.activation);
      return command.outcome;
    },
    [mediaByIndex, moveTo, onSelect, selectedIndex, total]
  );

  /** The browser arrows move like the keyboard, and make this the active row. */
  const moveByArrow = (delta: -1 | 1) => {
    const index = Math.max(0, Math.min(selectedIndex + delta, total - 1));
    moveTo(index);
    const media = mediaByIndex.get(index);
    if (media) onActive(categoryIndex, index, media);
  };

  useImperativeHandle(
    forwardedRef,
    () => ({
      focusIndex: index => {
        moveTo(index);
        return total > 0;
      },
      isEmpty: () => current.currentData?.total === 0,
      handleAction,
      getNavigationContext: () => ({
        selected: mediaByIndex.get(selectedIndex) ?? null,
        left: mediaByIndex.get(selectedIndex - 1) ?? null,
        right: mediaByIndex.get(selectedIndex + 1) ?? null,
      }),
      getInterestWindow: () => {
        if (!total) return { media: [], center: null, visible: [] };
        const start = Math.max(0, Math.min(selectedIndex - 5, total - 11));
        const length = Math.min(11, total - start);
        const left = scroller.element.current?.scrollLeft ?? selectedIndex * step;
        return {
          media: Array.from({ length }, (_, offset) => mediaByIndex.get(start + offset) ?? null),
          center: selectedIndex - start,
          visible: Array.from({ length }, (_, offset) => start + offset)
            .filter(index => index * step < left + contentWidth && (index + 1) * step - gap > left)
            .map(index => index - start),
        };
      },
    }),
    [
      contentWidth,
      current.currentData?.total,
      gap,
      handleAction,
      mediaByIndex,
      moveTo,
      scroller.element,
      selectedIndex,
      step,
      total,
    ]
  );

  // A selection restored past the end of a list that shrank moves to its last card.
  useEffect(() => {
    const loadedTotal = current.currentData?.total ?? 0;
    if (loadedTotal > 0 && selectedIndex >= loadedTotal) moveTo(loadedTotal - 1, false);
  }, [current.currentData, moveTo, selectedIndex]);

  useEffect(() => {
    onMediaLoaded?.(
      category.slug,
      mediaOverride ?? [current.currentData, adjacent.currentData].flatMap(r => r?.results ?? [])
    );
  }, [adjacent.currentData, category.slug, current.currentData, mediaOverride, onMediaLoaded]);

  useEffect(() => {
    if (effectiveLoadIntent === 'dormant') return;
    if (!mediaOverride && !current.currentData && !current.isError) return;
    onDataReady?.(category.slug);
  }, [
    category.slug,
    current.currentData,
    current.isError,
    effectiveLoadIntent,
    mediaOverride,
    onDataReady,
  ]);

  // Ask the backend to prepare what is on screen: the visible page, then the cards in view.
  useEffect(() => {
    if (mediaOverride || !visible || !current.currentData?.results.length) return;
    const items = current.currentData.results.map(media => ({
      ...mediaRef(media),
      tier: 'visible' as const,
    }));
    void promoteListMedia({ items });
  }, [current.currentData, mediaOverride, promoteListMedia, visible]);

  useEffect(() => {
    if (mediaOverride || !visible || !current.currentData?.results.length) return;
    const timeout = window.setTimeout(() => {
      const items = Array.from({ length: mediaPerPage }, (_, offset) =>
        mediaByIndex.get(selectedIndex + offset)
      )
        .filter((media): media is MediaDto => Boolean(media))
        .map(media => ({ ...mediaRef(media), tier: 'viewport' as const }));
      if (items.length) void promoteListMedia({ items });
    }, VIEWPORT_PROMOTION_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [
    current.currentData,
    mediaByIndex,
    mediaOverride,
    mediaPerPage,
    promoteListMedia,
    selectedIndex,
    visible,
  ]);

  // Decode the hero backdrops around the selection ahead of time, so moving to a neighbour
  // swaps the hero without decode work. A row that moves off screen stops wanting them.
  const preloadOwner = useId();
  useEffect(() => {
    if (!visible || !mediaByIndex.size) {
      imagePreloader.clear(preloadOwner);
      return;
    }
    const urls: string[] = [];
    const end = Math.min(total - 1, selectedIndex + mediaPerPage + 2);
    for (let index = Math.max(0, selectedIndex - 2); index <= end; index += 1) {
      const media = mediaByIndex.get(index);
      if (media?.backdrop) urls.push(artworkUrl(media.backdrop, 'backdrop'));
    }
    void imagePreloader.prepare(preloadOwner, urls, NEARBY);
  }, [mediaByIndex, mediaPerPage, preloadOwner, selectedIndex, total, visible]);
  useEffect(() => () => imagePreloader.clear(preloadOwner), [preloadOwner]);

  const queuedBackdropMedia = useRef(new Set<string>());
  useEffect(() => {
    if (!visible || !mediaByIndex.size) return;
    const items = [...mediaByIndex.values()]
      .filter(media => !media.backdropFocus && Boolean(media.backdrop))
      .filter(media => !queuedBackdropMedia.current.has(`${media._type}:${media.mediaId}`))
      .map(mediaRef)
      .slice(0, 50);
    if (!items.length) return;
    const keys = items.map(item => `${item.mediaType}:${item.mediaId}`);
    keys.forEach(key => queuedBackdropMedia.current.add(key));
    try {
      void queueBackdropFocus({ items })
        .unwrap()
        .catch(() => keys.forEach(key => queuedBackdropMedia.current.delete(key)));
    } catch {
      keys.forEach(key => queuedBackdropMedia.current.delete(key));
    }
  }, [mediaByIndex, queueBackdropFocus, visible]);

  const title = <CategoryTitle id={`category-${category.slug}`}>{category.name}</CategoryTitle>;
  if (!mediaOverride && effectiveLoadIntent === 'dormant') {
    return (
      <RowContainer>
        {title}
        <State aria-hidden="true" />
      </RowContainer>
    );
  }
  if (!mediaOverride && (current.isLoading || current.isFetching) && !current.currentData) {
    return (
      <RowContainer>
        {title}
        <State>
          <Spinner text="Loading..." />
        </State>
      </RowContainer>
    );
  }
  if (!mediaOverride && current.isError && !current.currentData) {
    return (
      <RowContainer>
        {title}
        <State>Failed to load content.</State>
      </RowContainer>
    );
  }
  if (!total) {
    return (
      <RowContainer>
        {title}
        <State>Nothing here yet.</State>
      </RowContainer>
    );
  }

  const radius = rowRenderRadius(mediaPerPage);
  const first = Math.max(0, selectedIndex - radius);
  const last = Math.min(total - 1, selectedIndex + radius);
  const canMoveLeft = selectedIndex > 0;
  const canMoveRight = selectedIndex < total - 1;
  // Room after the last card, so it too can scroll into the leading slot.
  const tailWidth = Math.max(0, (mediaPerPage - 1) * step - gap);

  return (
    <RowContainer aria-labelledby={`category-${category.slug}`}>
      {title}
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
          ref={scroller.ref}
          $gap={gap}
          $peekWidth={peekWidth}
          data-testid="category-row-scroll-container"
          onScroll={onInterest}
        >
          {first > 0 && <Spacer width={first * step - gap} />}
          {Array.from({ length: last - first + 1 }, (_, offset) => {
            const index = first + offset;
            const media = mediaByIndex.get(index);
            if (!media) return <Spacer key={`placeholder-${index}`} width={mediaWidth} />;
            const activate = () => {
              updateSelectedIndex(index);
              onActive(categoryIndex, index, media);
            };
            return (
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
                onFocus={activate}
                onHover={() => {
                  activate();
                  cardRefs.current.get(index)?.focus({ preventScroll: true });
                }}
                progress={progress}
                onSelect={() => {
                  // Clicking a card must update the logical selection before opening details;
                  // otherwise Back returns to the row's previous keyboard selection.
                  activate();
                  onSelect(media);
                }}
              />
            );
          })}
          {last < total - 1 && <Spacer width={(total - last - 1) * step - gap} />}
          {tailWidth > 0 && <Spacer width={tailWidth} />}
        </ScrollContainer>
      </CarouselViewport>
    </RowContainer>
  );
});
