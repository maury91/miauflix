import { listPageArgs, useListPage } from '@features/home-feed/listPages';
import { ROW_PAGE_SIZE, rowPagesFor } from '@features/home-feed/row-pages';
import { usePromoteListMediaMutation } from '@features/media/api/lists.api';
import { useQueueBackdropFocusMutation } from '@features/media/api/media.api';
import { progressByMedia, progressKey } from '@features/progress/lib/progress-lookup';
import type { ListDto, MediaDto, ProgressEntry } from '@miauflix/backend';
import { skipToken } from '@reduxjs/toolkit/query';
import { builtForTizen, IS_TV } from '@shared/config/constants';
import {
  Carousel,
  type CarouselItemState,
  type CollectionGeometry,
  Heading,
  Message,
  ProgressSpinner,
  useCarouselNavigation,
} from '@shared/design-system';
import { presentError } from '@shared/lib/api-error';
import { IDLE, imagePreloader, NEARBY } from '@shared/lib/image-preloader';
import { artworkUrl } from '@shared/lib/media.utils';
import { useActiveIdWithin, useOptionalNavigation } from '@shared/navigation';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import { HOME_NAV } from '../homeNav';
import { useCoalescedValue } from '../hooks/useCoalescedValue';
import * as styles from './categoryRow.css';
import { MediaCard } from './MediaCard';

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
/**
 * Cards mounted past each side of the visible page once a row has expanded: the TV styles and
 * rasterizes every card it keeps, so it keeps fewer. Until then, one (the peeking card).
 */
const EXPANDED_OVERSCAN = builtForTizen ? 2 : 4;

export interface CategoryRowHandle {
  getInterestWindow: () => {
    media: Array<MediaDto | null>;
    center: number | null;
    visible: number[];
  };
}

interface CategoryRowProps {
  category: ListDto;
  categoryIndex: number;
  /** The card the row starts on (its remembered selection). */
  initialIndex: number;
  /** The row's selection moved (coalesced on the TV); Home remembers it per list. */
  onSelectionChange?: (index: number) => void;
  loadIntent?: 'visible' | 'prefetch' | 'dormant';
  visible?: boolean;
  /** Rendered in full off screen too: Home readies it while idle (see RowLoadState.warm). */
  warm?: boolean;
  /** Home's row geometry (collectionGeometry). */
  geometry: CollectionGeometry;
  /** The row whose selected media supplies the hero. */
  isCurrentRow: boolean;
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

/** The failure in one or two sentences: the server's message and, when there is one, the fix. */
function errorText(error: unknown, fallback: string): string {
  const { message, hint } = presentError(error, fallback);
  return hint ? `${message} ${hint}` : message;
}

/**
 * One Home row: a Carousel of MediaTiles registered with the navigation layer as `home-row:<slug>`.
 * Left/Right move the selection one card and bring it to the leading slot; Up/Down leave the row;
 * the pointer focuses a card without scrolling. The row adapts its list into the carousel: only the
 * list pages around the selection are loaded (row-pages.ts), and only the cards near the visible
 * ones are mounted. A row still loading keeps its place in the navigation (focus can rest on it and
 * lands on its remembered card once the cards arrive); a failed or empty row is skipped. Supplying
 * mediaOverride bypasses list fetching and promotion, including for an empty array.
 *
 * Memoized: Home re-renders on every row change, and only the rows it changes should follow.
 */
export const CategoryRow = memo(
  forwardRef<CategoryRowHandle, CategoryRowProps>(function CategoryRow(
    {
      category,
      categoryIndex,
      initialIndex,
      onSelectionChange,
      loadIntent = 'dormant',
      visible = false,
      warm = false,
      geometry,
      isCurrentRow,
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
    const navId = HOME_NAV.row(category.slug);
    const layer = useOptionalNavigation();
    const holdsFocus = useActiveIdWithin(navId) !== null;
    const { itemWidth, perPage } = geometry;
    const fetching = !mediaOverride && loadIntent !== 'dormant';

    // The selection lives in the carousel; the pages around it are read from the cache, which
    // homeFeedMiddleware fills for the rows Home wants. Until the first page arrives the row's
    // size is unknown, and the carousel keeps the remembered card.
    const [total, setTotal] = useState(mediaOverride?.length ?? 0);
    const navigation = useCarouselNavigation(
      { count: total, perPage, paging: 'item' },
      initialIndex
    );
    const selectedIndex = navigation.focusedIndex;
    const pageQuery = (index: number | null) =>
      fetching && index !== null
        ? listPageArgs(category.slug, index, loadIntent === 'visible' ? 'visible' : 'prefetch')
        : skipToken;
    const current = useListPage(pageQuery(Math.floor(selectedIndex / ROW_PAGE_SIZE)));
    const loadedTotal =
      mediaOverride?.length ?? current.currentData?.total ?? current.data?.total ?? 0;
    // The size seen last: a page that is loading again (a new selection's page) keeps it
    if (loadedTotal !== total && (mediaOverride || current.currentData || current.data))
      setTotal(loadedTotal);
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

    // Home hears of the selection coalesced on the TV (see SELECTION_REPORT_MS), at once when
    // the row is left or a card opens, so Back returns to the card even right after a move.
    const reportedIndex = useCoalescedValue(selectedIndex, builtForTizen ? SELECTION_REPORT_MS : 0);
    // The remembered card is Home's already
    const lastReported = useRef<number | undefined>(initialIndex);
    const reportSelection = useCallback(
      (index: number) => {
        if (index === lastReported.current) return;
        lastReported.current = index;
        onSelectionChange?.(index);
      },
      [onSelectionChange]
    );
    useEffect(() => {
      if (total) reportSelection(reportedIndex);
      // Only a new coalesced index reports.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reportedIndex]);
    useEffect(() => {
      if (!holdsFocus && total) reportSelection(selectedIndex);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [holdsFocus]);

    // The hero follows the reported selection of the current row
    useEffect(() => {
      const media = mediaByIndex.get(reportedIndex);
      if (media && isCurrentRow) onActive(categoryIndex, reportedIndex, media);
    }, [categoryIndex, isCurrentRow, mediaByIndex, onActive, reportedIndex]);

    const openCard = useCallback(
      (index: number, media: MediaDto) => {
        reportSelection(index);
        onActive(categoryIndex, index, media);
        onSelect(media);
      },
      [categoryIndex, onActive, onSelect, reportSelection]
    );

    // The track settles: the cards in view changed (realtime interest).
    useEffect(() => {
      if (!onInterest) return;
      const timeout = window.setTimeout(onInterest, 160);
      return () => window.clearTimeout(timeout);
    }, [navigation.leadingIndex, onInterest]);

    useImperativeHandle(
      forwardedRef,
      () => ({
        getInterestWindow: () => {
          if (!total) return { media: [], center: null, visible: [] };
          const start = Math.max(0, Math.min(selectedIndex - 5, total - 11));
          const length = Math.min(11, total - start);
          const leading = navigation.leadingIndex;
          return {
            media: Array.from({ length }, (_, offset) => mediaByIndex.get(start + offset) ?? null),
            center: selectedIndex - start,
            visible: Array.from({ length }, (_, offset) => start + offset)
              .filter(index => index >= leading && index < leading + perPage)
              .map(index => index - start),
          };
        },
      }),
      [mediaByIndex, navigation.leadingIndex, perPage, selectedIndex, total]
    );

    useEffect(() => {
      onMediaLoaded?.(
        category.slug,
        mediaOverride ?? [current.currentData, adjacent.currentData].flatMap(r => r?.results ?? [])
      );
    }, [adjacent.currentData, category.slug, current.currentData, mediaOverride, onMediaLoaded]);

    useEffect(() => {
      if (loadIntent === 'dormant') return;
      if (!mediaOverride && !current.currentData && !current.isError) return;
      onDataReady?.(category.slug);
    }, [
      category.slug,
      current.currentData,
      current.isError,
      loadIntent,
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
        const items = Array.from({ length: perPage }, (_, offset) =>
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
      perPage,
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
      const end = Math.min(total - 1, selectedIndex + perPage + 2);
      for (let index = Math.max(0, selectedIndex - 2); index <= end; index += 1) {
        const media = mediaByIndex.get(index);
        if (media?.backdrop) urls.push(artworkUrl(media.backdrop, 'backdrop'));
      }
      void imagePreloader.prepare(preloadOwner, urls, NEARBY);
    }, [mediaByIndex, perPage, preloadOwner, selectedIndex, total, visible]);
    useEffect(() => () => imagePreloader.clear(preloadOwner), [preloadOwner]);

    // While the user isn't moving, fetch every loaded card and its hero backdrop, nearest the
    // selection first, so later moves find them in the cache. Rebuilt when the row's pages
    // change, not on every move.
    const idleOwner = `${preloadOwner}:idle`;
    const idleSelection = useRef(selectedIndex);
    idleSelection.current = selectedIndex;
    useEffect(() => {
      const selected = idleSelection.current;
      if (loadIntent === 'dormant' || !mediaByIndex.size) {
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
                artworkUrl(media.backdrop, 'card', itemWidth),
                artworkUrl(media.backdrop, 'backdrop'),
              ]
            : []
        );
      void imagePreloader.prepare(idleOwner, urls, IDLE);
    }, [idleOwner, itemWidth, loadIntent, mediaByIndex]);
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

    // Stable while the cards and their progress are, so a move re-renders only two slots
    const renderItem = useCallback(
      (index: number, { focused }: CarouselItemState) => {
        const media = mediaByIndex.get(index);
        if (!media) return null;
        return (
          <MediaCard
            media={media}
            width={itemWidth}
            focused={focused}
            progress={progressLookup.get(progressKey(media))}
            onSelect={() => openCard(index, media)}
          />
        );
      },
      [itemWidth, mediaByIndex, openCard, progressLookup]
    );

    const titleId = `category-${category.slug}`;
    const title = (
      <div className={styles.title}>
        <Heading level={2} variant="heading" id={titleId} maxLines={1}>
          {category.name}
        </Heading>
      </div>
    );
    // Loading until the row's size is known; a later page loading shows its cards as they come
    const loading = !mediaOverride && !total && (loadIntent === 'dormant' || !current.currentData);
    if (!mediaOverride && current.isError && !current.currentData) {
      return (
        <div className={styles.row}>
          {title}
          {/* Polite, and only on screen: prefetched rows failing is not urgent. */}
          <div className={styles.state}>
            <Message tone="danger" live={visible ? 'polite' : undefined}>
              {errorText(current.error, 'Failed to load content.')}
            </Message>
          </div>
        </div>
      );
    }
    if (!loading && !total) {
      return (
        <div className={styles.row}>
          {title}
          <div className={styles.state}>Nothing here yet.</div>
        </div>
      );
    }

    return (
      <div className={styles.row}>
        {title}
        <div className={styles.carousel}>
          <Carousel
            labelledBy={titleId}
            count={loading ? 0 : total}
            renderItem={renderItem}
            geometry={geometry}
            navId={navId}
            navigation={navigation}
            overscan={expanded ? EXPANDED_OVERSCAN : 1}
            pageButtons={
              IS_TV
                ? undefined
                : {
                    previousLabel: `Previous ${category.name} items`,
                    nextLabel: `Next ${category.name} items`,
                    onPage: direction => {
                      const leading = Math.max(
                        0,
                        Math.min(
                          navigation.leadingIndex + direction * perPage,
                          Math.max(0, total - perPage)
                        )
                      );
                      navigation.page(direction);
                      layer?.focus(navId, { part: String(leading) });
                    },
                  }
            }
          />
          {/* A row still loading holds its place, and focus can rest on it meanwhile. Off screen
              on the TV, no spinner: Chromium 69 keeps animating it out of view. */}
          {loading && loadIntent !== 'dormant' && !(builtForTizen && !visible) && (
            <div className={styles.loading}>
              <ProgressSpinner label="Loading..." showLabel />
            </div>
          )}
        </div>
      </div>
    );
  })
);
