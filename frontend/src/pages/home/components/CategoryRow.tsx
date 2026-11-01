import { listPageArgs, useListPage } from '@features/home-feed/listPages';
import { usePromoteListMediaMutation } from '@features/media/api/lists.api';
import { useQueueBackdropFocusMutation } from '@features/media/api/media.api';
import type { ListDto, MediaDto, ProgressEntry } from '@miauflix/backend';
import { skipToken } from '@reduxjs/toolkit/query';
import { Spinner } from '@shared/components';
import { builtForTizen, IS_TV, PALETTE } from '@shared/config/constants';
import { Button as BaseButton } from '@shared/ui/button/Button';
import {
  forwardRef,
  memo,
  type MutableRefObject,
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
import { useCoalescedValue } from '../hooks/useCoalescedValue';
import { useSmoothScroller } from '../hooks/useSmoothScroller';
import { IDLE, imagePreloader, NEARBY } from '../image-preloader';
import { artworkUrl } from '../media.utils';
import { progressByMedia, progressKey } from '../progress-lookup';
import { ROW_PAGE_SIZE, rowPagesFor, rowRenderRadius } from '../row-pages';
import { MediaCard } from './MediaCard';

import ChevronLeftIcon from '~icons/line-md/chevron-left';
import ChevronRightIcon from '~icons/line-md/chevron-right';

const VIEWPORT_PROMOTION_DEBOUNCE_MS = 300;
/**
 * On the TV, how long the selection must pause before Home hears of the moves after the first:
 * each report re-renders Home and the hero (~50 ms there), longer than a held key's repeat.
 */
const SELECTION_REPORT_MS = 150;
/**
 * The row fires its promotion and backdrop requests and never reads their state: selecting none
 * of it keeps each request's pending and fulfilled updates from re-rendering the row.
 */
const IGNORE_RESULT = { selectFromResult: () => NO_RESULT };
const NO_RESULT = {};

/** How long a row that came into view waits before rendering its cards out of view (TV). */
const CARD_WINDOW_EXPAND_MS = 400;

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
  /* On the TV the track is as wide as its cards and moves on its own layer, clipped by the
     viewport: no layout or repaint per frame (see SmoothScrollerOptions). */
  ${builtForTizen ? 'width: max-content; will-change: transform;' : 'overflow-x: auto;'}
  overflow-y: visible;
  padding: 0.8vh ${({ $peekWidth }) => `calc(${$peekWidth}px + 0.5vh)`} 1.4vh;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

/**
 * The TV's focus ring: one per row, over the leading slot, where the row always brings the
 * selected card, so it never moves. Scaling the cards instead lifts the two cards that change
 * onto layers of their own while they animate, then repaints the row's track under them, some
 * 60 ms of raster per move on a TV.
 */
const FocusRing = styled.div<{ $peekWidth: number }>`
  position: absolute;
  z-index: 1;
  top: 0.8vh;
  left: calc(${({ $peekWidth }) => $peekWidth}px + 0.5vh);
  margin: -3px;
  border: 3px solid #fff;
  border-radius: 9px;
  pointer-events: none;
  transition: opacity 150ms ease-out;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
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
  /** Rendered in full off screen too: Home readies it while idle (see RowLoadState.warm). */
  warm?: boolean;
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

/** What a card asks of its row; the row refreshes these every render. */
interface RowCardHandlers {
  setRef: (index: number, node: HTMLButtonElement | null) => void;
  activate: (index: number, media: MediaDto) => void;
  hover: (index: number, media: MediaDto) => void;
  select: (index: number, media: MediaDto) => void;
}

/**
 * One card of a row. Memoized, so moving the selection re-renders only the cards whose
 * selection changes, not every card: a TV takes most of a second to re-render them all.
 */
const RowCard = memo(function RowCard({
  index,
  media,
  width,
  selected,
  progress,
  handlers,
}: {
  index: number;
  media: MediaDto;
  width: number;
  selected: boolean;
  progress?: ProgressEntry;
  handlers: MutableRefObject<RowCardHandlers>;
}) {
  return (
    <MediaCard
      ref={(node: HTMLButtonElement | null) => handlers.current.setRef(index, node)}
      media={media}
      width={width}
      selected={selected}
      showFocus={!builtForTizen}
      tabIndex={selected ? 0 : -1}
      onFocus={() => handlers.current.activate(index, media)}
      onHover={() => handlers.current.hover(index, media)}
      progress={progress}
      onSelect={() => handlers.current.select(index, media)}
    />
  );
});

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
/** Memoized: Home re-renders on every move, and only the rows it changes should follow. */
export const CategoryRow = memo(
  forwardRef<CategoryRowHandle, CategoryRowProps>(function CategoryRow(
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
      warm = false,
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
    // On the TV the row moves its own selection and reports it coalesced (see
    // SELECTION_REPORT_MS): `ownIndex` leads the reported index until Home catches up.
    const [ownIndex, setOwnIndex] = useState<number | null>(null);
    const selectedIndex = ownIndex ?? controlledIndex ?? uncontrolledIndex;
    const reportedIndex = useCoalescedValue(selectedIndex, builtForTizen ? SELECTION_REPORT_MS : 0);
    const lastReported = useRef<number | undefined>(undefined);
    const effectiveLoadIntent = loadIntent ?? (nearby ? 'visible' : 'dormant');
    const fetching = !mediaOverride && effectiveLoadIntent !== 'dormant';

    // Data: the selection's page, and the neighbouring page once the selection nears it, read
    // from the cache: homeFeedMiddleware loads the pages of the rows Home wants.
    const pageQuery = (index: number | null) =>
      fetching && index !== null
        ? listPageArgs(
            category.slug,
            index,
            effectiveLoadIntent === 'visible' ? 'visible' : 'prefetch'
          )
        : skipToken;
    const current = useListPage(pageQuery(Math.floor(selectedIndex / ROW_PAGE_SIZE)));
    const total = mediaOverride?.length ?? current.currentData?.total ?? current.data?.total ?? 0;
    const adjacent = useListPage(pageQuery(rowPagesFor(selectedIndex, total).neighbour));

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

    const progressLookup = useMemo(() => progressByMedia(progress), [progress]);
    // On the TV, a row off screen keeps only the cards in view, and gets the rest shortly after
    // it comes into view rather than during the move that brings it there.
    const [expanded, setExpanded] = useState(!builtForTizen || visible);
    // A row that leaves view (and is not kept warm) goes back to the cards in view, so rows
    // passed on the way stay small off screen.
    const wantsExpansion = visible || warm;
    useEffect(() => {
      if (!builtForTizen) return;
      if (!wantsExpansion) {
        setExpanded(false);
        return;
      }
      if (expanded) return;
      const timeout = window.setTimeout(() => setExpanded(true), CARD_WINDOW_EXPAND_MS);
      return () => window.clearTimeout(timeout);
    }, [expanded, wantsExpansion]);
    const [promoteListMedia] = usePromoteListMediaMutation(IGNORE_RESULT);
    const [queueBackdropFocus] = useQueueBackdropFocusMutation(IGNORE_RESULT);
    const step = mediaWidth + gap;
    const cardRefs = useRef(new Map<number, HTMLButtonElement>());
    // On the TV the row moves on a transform (see SmoothScrollerOptions), which has no scroll
    // events: report the cards in view when it settles instead.
    const scroller = useSmoothScroller('x', {
      transform: builtForTizen,
      onRest: builtForTizen ? onInterest : undefined,
    });
    const { element: scrollElement, position: scrollPosition } = scroller;
    /** Set by keyboard and arrow moves: focus the selected card once it is rendered. */
    const wantsFocus = useRef(isCurrentRow);
    /** Bumped to scroll the selection into the leading slot; hover selects without scrolling. */
    const [alignRequest, setAlignRequest] = useState(0);

    const updateSelectedIndex = useCallback(
      (index: number) => {
        if (builtForTizen) {
          setOwnIndex(index);
          return;
        }
        if (controlledIndex === undefined) setUncontrolledIndex(index);
        onSelectionChange?.(index);
      },
      [controlledIndex, onSelectionChange]
    );

    const reportSelection = useCallback(
      (index: number) => {
        if (index === lastReported.current) return;
        lastReported.current = index;
        onSelectionChange?.(index);
      },
      [onSelectionChange]
    );
    useEffect(() => {
      if (builtForTizen && ownIndex !== null) reportSelection(reportedIndex);
      // Only a new coalesced index reports.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reportedIndex]);
    // Leaving the row reports its selection at once: Home reads it to come back to this row.
    useEffect(() => {
      if (!active && ownIndex !== null) reportSelection(ownIndex);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);
    /**
     * Open a card's details. On the TV the selection is reported at once, not coalesced: Home
     * stores it now, so Back returns to this card even right after a move.
     */
    const openCard = useCallback(
      (index: number, media: MediaDto) => {
        if (builtForTizen) {
          reportSelection(index);
          onActive(categoryIndex, index, media);
        }
        onSelect(media);
      },
      [categoryIndex, onActive, onSelect, reportSelection]
    );
    // A selection Home sets itself (not one this row reported) replaces the row's own.
    useEffect(() => {
      if (controlledIndex !== undefined && controlledIndex !== lastReported.current)
        setOwnIndex(null);
    }, [controlledIndex]);

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

    // The hero follows the reported selection (coalesced on the TV).
    useEffect(() => {
      const media = mediaByIndex.get(reportedIndex);
      if (media && isCurrentRow) onActive(categoryIndex, reportedIndex, media);
    }, [active, categoryIndex, isCurrentRow, mediaByIndex, onActive, reportedIndex]);

    useEffect(() => {
      if (!active || !wantsFocus.current) return;
      const card = cardRefs.current.get(selectedIndex);
      if (!card) return;
      wantsFocus.current = false;
      card.focus({ preventScroll: true });
    }, [active, alignRequest, mediaByIndex, selectedIndex]);

    const handleAction = useCallback(
      (action: HomeAction): NavigationOutcome => {
        const command = resolveCarouselAction(
          action,
          selectedIndex,
          total,
          mediaByIndex.get(selectedIndex) ?? null
        );
        if (command.nextIndex !== undefined) moveTo(command.nextIndex);
        if (command.activation) openCard(selectedIndex, command.activation);
        return command.outcome;
      },
      [mediaByIndex, moveTo, openCard, selectedIndex, total]
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
          const left = scrollElement.current ? scrollPosition() : selectedIndex * step;
          return {
            media: Array.from({ length }, (_, offset) => mediaByIndex.get(start + offset) ?? null),
            center: selectedIndex - start,
            visible: Array.from({ length }, (_, offset) => start + offset)
              .filter(
                index => index * step < left + contentWidth && (index + 1) * step - gap > left
              )
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
        scrollElement,
        scrollPosition,
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

    const promotedViewport = useRef('');
    useEffect(() => {
      if (mediaOverride || !visible || !current.currentData?.results.length) return;
      const timeout = window.setTimeout(() => {
        const items = Array.from({ length: mediaPerPage }, (_, offset) =>
          mediaByIndex.get(selectedIndex + offset)
        )
          .filter((media): media is MediaDto => Boolean(media))
          .map(media => ({ ...mediaRef(media), tier: 'viewport' as const }));
        const key = items.map(item => `${item.mediaType}:${item.mediaId}`).join(',');
        if (!items.length || key === promotedViewport.current) return;
        promotedViewport.current = key;
        // A failed promotion is retried the next time these cards are in view.
        const forget = () => {
          if (promotedViewport.current === key) promotedViewport.current = '';
        };
        try {
          void promoteListMedia({ items }).unwrap().catch(forget);
        } catch {
          forget();
        }
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

    // While the user isn't moving, fetch every loaded card and its hero backdrop, nearest the
    // selection first, as the legacy app did, so later moves find them in the cache. Rebuilt when
    // the row's pages change, not on every move.
    const idleOwner = `${preloadOwner}:idle`;
    const idleSelection = useRef(selectedIndex);
    idleSelection.current = selectedIndex;
    useEffect(() => {
      const selected = idleSelection.current;
      if (effectiveLoadIntent === 'dormant' || !mediaByIndex.size) {
        imagePreloader.clear(idleOwner);
        return;
      }
      const distance = (index: number) =>
        index >= selected ? index - selected : (selected - index) * 2;
      const urls = [...mediaByIndex.entries()]
        .sort(([left], [right]) => distance(left) - distance(right))
        .flatMap(([, media]) =>
          media.backdrop
            ? [
                artworkUrl(media.backdrop, 'card', mediaWidth),
                artworkUrl(media.backdrop, 'backdrop'),
              ]
            : []
        );
      void imagePreloader.prepare(idleOwner, urls, IDLE);
    }, [effectiveLoadIntent, idleOwner, mediaByIndex, mediaWidth]);
    useEffect(() => () => imagePreloader.clear(idleOwner), [idleOwner]);

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

    const activateCard = (index: number, media: MediaDto) => {
      updateSelectedIndex(index);
      // On the TV the reported selection reaches the hero (coalesced, see SELECTION_REPORT_MS).
      if (!builtForTizen) onActive(categoryIndex, index, media);
    };
    const cardHandlers = useRef<RowCardHandlers>(null!);
    cardHandlers.current = {
      setRef: (index: number, node: HTMLButtonElement | null) => {
        if (node) cardRefs.current.set(index, node);
        else cardRefs.current.delete(index);
      },
      activate: activateCard,
      hover: (index: number, media: MediaDto) => {
        activateCard(index, media);
        cardRefs.current.get(index)?.focus({ preventScroll: true });
      },
      select: (index: number, media: MediaDto) => {
        // Clicking a card must update the logical selection before opening details;
        // otherwise Back returns to the row's previous keyboard selection.
        activateCard(index, media);
        openCard(index, media);
      },
    };

    const title = <CategoryTitle id={`category-${category.slug}`}>{category.name}</CategoryTitle>;
    if (!mediaOverride && effectiveLoadIntent === 'dormant') {
      return (
        <RowContainer>
          {title}
          <State aria-hidden="true" />
        </RowContainer>
      );
    }
    // Not requested yet counts as loading: the store starts the request after the row mounts.
    if (!mediaOverride && !current.currentData && !current.isError) {
      return (
        <RowContainer>
          {title}
          {/* Off screen on the TV, no spinner: Chromium 69 keeps animating it out of view. */}
          <State>{builtForTizen && !visible ? null : <Spinner text="Loading..." />}</State>
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

    const radius = rowRenderRadius(mediaPerPage, ROW_PAGE_SIZE, builtForTizen);
    // Until it expands, a row renders only the cards in view: the peeking one and a page.
    const first = Math.max(0, selectedIndex - (expanded ? radius : 1));
    const last = Math.min(total - 1, selectedIndex + (expanded ? radius : mediaPerPage));
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
          {builtForTizen && (
            <FocusRing
              $peekWidth={peekWidth}
              aria-hidden="true"
              data-testid="category-row-focus-ring"
              style={{
                width: `${mediaWidth}px`,
                height: `${Math.round((mediaWidth * 9) / 16)}px`,
                opacity: active ? 1 : 0,
              }}
            />
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
              return (
                <RowCard
                  // Include the logical position so malformed upstream duplicate identities
                  // cannot make React reconcile two cards as the same child.
                  key={`${media._type}-${media.mediaId}-${index}`}
                  index={index}
                  media={media}
                  width={mediaWidth}
                  selected={active && index === selectedIndex}
                  progress={progressLookup.get(progressKey(media))}
                  handlers={cardHandlers}
                />
              );
            })}
            {last < total - 1 && <Spacer width={(total - last - 1) * step - gap} />}
            {tailWidth > 0 && <Spacer width={tailWidth} />}
          </ScrollContainer>
        </CarouselViewport>
      </RowContainer>
    );
  })
);
