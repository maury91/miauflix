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
  useCarouselPosition,
} from '@shared/design-system';
import { ITEM_WIDTH_OF_HEIGHT } from '@shared/design-system/carousel/collectionGeometry';
import { GlGroup, useRenderMode } from '@shared/design-system/gl';
import { useStableCallback } from '@shared/hooks/useStableCallback';
import { presentError } from '@shared/lib/api-error';
import { IDLE, imagePreloader, NEARBY } from '@shared/lib/image-preloader';
import { artworkUrl } from '@shared/lib/media.utils';
import { useFocusWithinChange, useOptionalNavigation } from '@shared/navigation';
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

import { homeRowLayout } from '../homeLayout';
import { HOME_NAV } from '../homeNav';
import { createCoalescer } from '../hooks/coalescer';
import * as styles from './categoryRow.css';
import { CategoryRowTitleGl } from './CategoryRowTitleGl';
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

/** How long after the track moved the cards in view count as settled (realtime interest). */
const TRACK_SETTLE_MS = 160;

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
 * Memoized: Home re-renders on every row change, and only the rows it changes should follow. A
 * move doesn't render the row either: the selection lives in the carousel's navigation (outside
 * React state), the Carousel and the two cards whose focus changed render, and the row acts on the
 * move imperatively (reports, preloading, promotion). The row itself renders only when what it
 * reads changes: the list page around the selection, its data, its props.
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
    const { itemWidth, perPage } = geometry;

    // The selection lives in the carousel; the pages around it are read from the cache, which
    // homeFeedMiddleware fills for the rows Home wants. Until the first page arrives the row's
    // size is unknown, and the carousel keeps the remembered card.
    const [total, setTotal] = useState(mediaOverride?.length ?? 0);
    // In GL the focused card always rests in the same place, under one static outline
    const glRows = useRenderMode() === 'gl';
    const navigation = useCarouselNavigation(
      { count: total, perPage, paging: glRows ? 'anchor' : 'item' },
      initialIndex
    );
    // The pages the row needs change only every few cards: the row renders then, not per move
    const currentPage = useCarouselPosition(navigation, position =>
      Math.floor(position.focused / ROW_PAGE_SIZE)
    )!;
    const neighbourPage = useCarouselPosition(
      navigation,
      position => rowPagesFor(position.focused, total).neighbour
    )!;
    // Read from the cache whatever the row's intent: a dormant row (mounted above the loaded
    // ones) shows the pages it loaded before, instead of nothing until Home wants it again.
    // `loadIntent` only decides what Home asks to load (homeFeedMiddleware), not what is read.
    const pageQuery = (index: number | null) =>
      !mediaOverride && index !== null
        ? listPageArgs(category.slug, index, loadIntent === 'visible' ? 'visible' : 'prefetch')
        : skipToken;
    const current = useListPage(pageQuery(currentPage));
    const loadedTotal =
      mediaOverride?.length ?? current.currentData?.total ?? current.data?.total ?? 0;
    // The size seen last: a page that is loading again (a new selection's page) keeps it
    if (loadedTotal !== total && (mediaOverride || current.currentData || current.data))
      setTotal(loadedTotal);
    const adjacent = useListPage(pageQuery(neighbourPage));

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
    // The hero follows the reported selection of the current row
    const reportedIndex = useRef(navigation.position().focused);
    const showInHero = useStableCallback(() => {
      const media = mediaByIndex.get(reportedIndex.current);
      if (media && isCurrentRow) onActive(categoryIndex, reportedIndex.current, media);
    });
    const report = useStableCallback((index: number) => {
      reportedIndex.current = index;
      if (total) reportSelection(index);
      showInHero();
    });
    const [reports] = useState(() =>
      createCoalescer<number>(builtForTizen ? SELECTION_REPORT_MS : 0, index => report(index))
    );
    useEffect(() => () => reports.cancel(), [reports]);
    useFocusWithinChange(navId, within => {
      if (!within && total) reportSelection(navigation.position().focused);
    });
    // A row mounting (or loading its first page) on a card other than the remembered one (fewer
    // cards now) reports it, and the hero shows the bounded card
    const hasCards = total > 0;
    useEffect(() => {
      if (!hasCards) return;
      const { focused } = navigation.position();
      reportedIndex.current = focused;
      reportSelection(focused);
      // When the row gains its cards only; later moves report through the coalescer
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasCards]);
    useEffect(() => {
      showInHero();
    }, [categoryIndex, isCurrentRow, mediaByIndex, onActive, showInHero]);
    // Home loads the pages around the reported card, and a held key reports only once it pauses:
    // entering a new page reports at once (once per page), so the pages ahead are requested
    // before the selection runs past the loaded ones (the row went black)
    useEffect(() => {
      if (total) reportSelection(navigation.position().focused);
      // On the page changing only
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage]);

    const openCard = useCallback(
      (index: number, media: MediaDto) => {
        reports.cancel();
        reportedIndex.current = index;
        reportSelection(index);
        onActive(categoryIndex, index, media);
        onSelect(media);
      },
      [categoryIndex, onActive, onSelect, reportSelection, reports]
    );

    // The track settles: the cards in view changed (realtime interest). So do they when a page of
    // cards arrives under a track that has already settled (a viewport only partly loaded).
    const interestTimer = useRef<number | undefined>(undefined);
    const scheduleInterest = useStableCallback(() => {
      window.clearTimeout(interestTimer.current);
      if (onInterest) interestTimer.current = window.setTimeout(onInterest, TRACK_SETTLE_MS);
    });
    useEffect(() => {
      scheduleInterest();
      return () => window.clearTimeout(interestTimer.current);
    }, [onInterest, scheduleInterest, mediaByIndex]);

    useImperativeHandle(
      forwardedRef,
      () => ({
        getInterestWindow: () => {
          if (!total) return { media: [], center: null, visible: [] };
          const { focused: selectedIndex, leading } = navigation.position();
          const start = Math.max(0, Math.min(selectedIndex - 5, total - 11));
          const length = Math.min(11, total - start);
          return {
            media: Array.from({ length }, (_, offset) => mediaByIndex.get(start + offset) ?? null),
            center: selectedIndex - start,
            visible: Array.from({ length }, (_, offset) => start + offset)
              .filter(index => index >= leading && index < leading + perPage)
              .map(index => index - start),
          };
        },
      }),
      [mediaByIndex, navigation, perPage, total]
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
    const viewportTimer = useRef<number | undefined>(undefined);
    const scheduleViewportPromotion = useStableCallback(() => {
      window.clearTimeout(viewportTimer.current);
      if (mediaOverride || !visible || !current.currentData?.results.length) return;
      viewportTimer.current = window.setTimeout(() => {
        // The visible window starts at the leading card, not at the focused one
        const { leading } = navigation.position();
        const items = Array.from({ length: perPage }, (_, offset) =>
          mediaByIndex.get(leading + offset)
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
    });
    useEffect(() => {
      scheduleViewportPromotion();
      return () => window.clearTimeout(viewportTimer.current);
    }, [
      current.currentData,
      mediaByIndex,
      mediaOverride,
      perPage,
      promoteListMedia,
      scheduleViewportPromotion,
      visible,
    ]);

    // Decode the hero backdrops around the selection ahead of time, so moving to a neighbour
    // swaps the hero without decode work. A row that moves off screen stops wanting them.
    const preloadOwner = useId();
    const preloadAroundSelection = useStableCallback(() => {
      if (!visible || !mediaByIndex.size) {
        imagePreloader.clear(preloadOwner);
        return;
      }
      const selectedIndex = navigation.position().focused;
      const urls: string[] = [];
      const end = Math.min(total - 1, selectedIndex + perPage + 2);
      for (let index = Math.max(0, selectedIndex - 2); index <= end; index += 1) {
        const media = mediaByIndex.get(index);
        if (media?.backdrop) urls.push(artworkUrl(media.backdrop, 'backdrop'));
      }
      void imagePreloader.prepare(preloadOwner, urls, NEARBY);
    });
    useEffect(() => {
      preloadAroundSelection();
    }, [mediaByIndex, perPage, preloadAroundSelection, total, visible]);
    useEffect(() => () => imagePreloader.clear(preloadOwner), [preloadOwner]);

    // While the user isn't moving, fetch every loaded card and its hero backdrop, nearest the
    // selection first, so later moves find them in the cache. Rebuilt when the row's pages
    // change, not on every move.
    const idleOwner = `${preloadOwner}:idle`;
    useEffect(() => {
      const selected = navigation.position().focused;
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
    }, [idleOwner, itemWidth, loadIntent, mediaByIndex, navigation]);
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

    // A move: the row acts on it without rendering (the Carousel renders the move itself)
    useEffect(() => {
      let previous = navigation.position();
      return navigation.subscribe(() => {
        const position = navigation.position();
        if (position.focused !== previous.focused) {
          reports.push(position.focused);
          preloadAroundSelection();
        }
        if (position.leading !== previous.leading) {
          scheduleInterest();
          scheduleViewportPromotion();
        }
        previous = position;
      });
    }, [navigation, preloadAroundSelection, reports, scheduleInterest, scheduleViewportPromotion]);

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

    // Stable, so the memoized Carousel skips the row's own renders
    const onPage = useStableCallback((direction: -1 | 1) => {
      navigation.page(direction);
      layer?.focus(navId, { part: String(navigation.position().leading) });
    });
    const pageButtons = useMemo(
      () =>
        IS_TV
          ? undefined
          : {
              previousLabel: `Previous ${category.name} items`,
              nextLabel: `Next ${category.name} items`,
              onPage,
            },
      [category.name, onPage]
    );

    // From the geometry, not the store: the row's sizes all come from collectionGeometry
    const windowHeight = geometry.itemWidth / ITEM_WIDTH_OF_HEIGHT;
    const titleId = `category-${category.slug}`;
    // Loading until the row's size is known; a later page loading shows its cards as they come
    const loading = !mediaOverride && !total && (loadIntent === 'dormant' || !current.currentData);
    const failedText =
      !mediaOverride && current.isError && !current.currentData
        ? errorText(current.error, 'Failed to load content.')
        : null;
    const empty = !failedText && !loading && !total;
    // Off-screen TV rows skip the spinner because Chromium 69 keeps animating it.
    const showLoading = loading && loadIntent !== 'dormant' && !(builtForTizen && !visible);
    const glState =
      failedText ?? (empty ? 'Nothing here yet.' : showLoading ? 'Loading...' : null);
    const title = (
      <div className={styles.title}>
        <Heading level={2} variant="heading" id={titleId} maxLines={1}>
          {category.name}
        </Heading>
        {glRows && (
          <CategoryRowTitleGl name={category.name} state={glState} geometry={geometry} />
        )}
      </div>
    );
    if (failedText) {
      return (
        <div className={styles.row}>
          {title}
          {/* Polite, and only on screen: prefetched rows failing is not urgent. */}
          <div className={styles.state}>
            <Message tone="danger" live={visible ? 'polite' : undefined}>
              {failedText}
            </Message>
          </div>
        </div>
      );
    }
    if (empty) {
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
          {/* Under the title and its margin (categoryRow.css.ts) */}
          <GlGroup y={homeRowLayout(windowHeight).carouselTop}>
            <Carousel
              labelledBy={titleId}
              count={loading ? 0 : total}
              renderItem={renderItem}
              geometry={geometry}
              navId={navId}
              navigation={navigation}
              overscan={expanded ? EXPANDED_OVERSCAN : 1}
              pageButtons={pageButtons}
              surface="black"
            />
          </GlGroup>
          {showLoading && (
            <div className={styles.loading}>
              <ProgressSpinner label="Loading..." showLabel />
            </div>
          )}
        </div>
      </div>
    );
  })
);
