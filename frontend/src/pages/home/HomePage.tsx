import { getTraktAssociation } from '@features/integrations/api/trakt.api';
import { useGetListsQuery, useGetPopularListsInfiniteQuery } from '@features/media/api/lists.api';
import { mediaApi } from '@features/media/api/media.api';
import {
  useRemoveIntentMutation,
  useUpdateIntentMutation,
} from '@features/preload/api/preload.api';
import { nextPreloadSequence, PRELOAD_CLIENT_ID } from '@features/preload/lib/intent-client';
import { progressApi } from '@features/progress/api/progress.api';
import {
  RealtimeClient,
  type RealtimeMediaRef,
  type RealtimeStatusMessage,
} from '@features/realtime/realtime.client';
import type {
  MediaDto,
  PlayableRef,
  PreloadPreparationSnapshot,
  PreloadPreparationSource,
  ProgressEntry,
} from '@miauflix/backend';
import type { ArtworkUpdate, MediaRef } from '@miauflix/service-contracts/catalog/v1';
import { Spinner } from '@shared/components';
import { PALETTE } from '@shared/config/constants';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { artworkActions } from '@store/slices/artwork';
import { selectCurrentSessionId, selectCurrentUser } from '@store/slices/auth';
import type { AppDispatch, RootState } from '@store/store';
import { type FC, type UIEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';

import { CategoryRow, type CategoryRowHandle } from './components/CategoryRow';
import { HomeSidebar } from './components/HomeSidebar';
import { MediaDetails, type MediaDetailsHandle } from './components/MediaDetails';
import { MediaHero } from './components/MediaHero';
import { PlayerView } from './components/PlayerView';
import { TraktModal } from './components/TraktModal';
import { useMediaBoxSizes } from './hooks/useMediaBoxSizes';
import { unfinishedProgress } from './continue-watching';
import { type HomeAction, type NavigationOutcome } from './homeNavigation';
import { getMediaTitle } from './media.utils';

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

type HomeView = 'browse' | 'details' | 'player';
type HomeRegion = 'sidebar' | 'carousel' | 'details' | 'player';

const CONTINUE_CATEGORY = {
  name: 'Continue watching',
  slug: 'continue-watching',
  description: 'Pick up where you left off',
  url: '/continue-watching',
};

/** Build a movie or show card from cached catalog data, returning null when that data is absent. */
function mediaFromProgress(
  state: Pick<RootState, 'mediaApi'>,
  entry: ProgressEntry
): MediaDto | null {
  if (entry.playable.kind === 'movie') {
    const response = mediaApi.endpoints.getMovie.select(entry.playable.mediaId)(state).data;
    if (!response) return null;
    return {
      _type: 'movie',
      id: response.id,
      mediaId: response.mediaId,
      imdbId: response.imdbId,
      title: response.title,
      overview: response.overview,
      poster: response.poster,
      backdrop: response.backdrop,
      backdropFocus: response.backdropFocus,
      logo: response.logo,
      heroLogo: response.heroLogo,
      artworkRevision: response.artworkRevision,
      cardLogoStatus: response.cardLogoStatus,
      heroLogoStatus: response.heroLogoStatus,
      genres: response.genres,
      popularity: response.popularity,
      rating: response.rating,
      releaseDate: response.releaseDate,
      runtime: response.runtime,
    };
  }
  const response = mediaApi.endpoints.getShow.select(entry.playable.showMediaId)(state).data;
  if (!response) return null;
  return {
    _type: 'tvshow',
    id: response.id,
    mediaId: response.mediaId,
    imdbId: response.imdbId,
    name: response.title,
    overview: response.overview ?? '',
    poster: response.poster ?? '',
    backdrop: response.backdrop ?? '',
    backdropFocus: response.backdropFocus,
    logo: response.logo ?? undefined,
    heroLogo: response.heroLogo ?? undefined,
    artworkRevision: response.artworkRevision,
    cardLogoStatus: response.cardLogoStatus,
    heroLogoStatus: response.heroLogoStatus,
    genres: response.genres,
    popularity: response.popularity ?? 0,
    rating: response.rating ?? 0,
    firstAirDate: response.firstAirDate ?? '',
  };
}

/** Coordinate browsing, details, and playback with progress refresh, preload interest, and Trakt prompts. */
const HomePage: FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const sessionId = useSelector((state: RootState) => selectCurrentSessionId(state));
  const currentUser = useSelector((state: RootState) => selectCurrentUser(state));
  const progressFromStore = useSelector(
    (state: RootState) => progressApi.endpoints.getProgress.select(undefined)(state).data?.progress
  );
  const progressEntries = useMemo(
    () => (Array.isArray(progressFromStore) ? progressFromStore : []),
    [progressFromStore]
  );
  const [updateIntent, intentState] = useUpdateIntentMutation();
  const [removeIntent] = useRemoveIntentMutation();
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
  const continueRefs = useMemo(() => unfinishedProgress(progressEntries), [progressEntries]);
  // Progress polling recreates entry objects even when the watched titles are unchanged. Keep
  // the metadata subscriptions keyed by media identity so polling cannot refetch every title.
  const continueHydrationSignature = continueRefs
    .map(entry =>
      entry.playable.kind === 'movie'
        ? `movie:${entry.playable.mediaId}`
        : `show:${entry.playable.showMediaId}`
    )
    .sort()
    .join('|');
  const continueHydrationKeys = useMemo(
    () => (continueHydrationSignature ? continueHydrationSignature.split('|') : []),
    [continueHydrationSignature]
  );
  const mediaCache = useSelector((state: RootState) => state.mediaApi);
  const continueMedia = useMemo(
    () =>
      continueRefs
        .map(entry => mediaFromProgress({ mediaApi: mediaCache }, entry))
        .filter((media): media is MediaDto => Boolean(media)),
    [continueRefs, mediaCache]
  );
  const displayCategories = useMemo(
    () => (continueMedia.length ? [CONTINUE_CATEGORY, ...categories] : categories),
    [categories, continueMedia.length]
  );
  const { mediaWidth, mediaPerPage, gap, margin, peekWidth } = useMediaBoxSizes();
  const pageRef = useRef<HTMLElement>(null);
  const [view, setView] = useState<HomeView>('browse');
  const [activeRegion, setActiveRegion] = useState<HomeRegion>('carousel');
  const [activeCategory, setActiveCategory] = useState(0);
  const activeCategoryRef = useRef(0);
  const [selectedByCategory, setSelectedByCategory] = useState<Record<string, number>>({});
  const [selectedMedia, setSelectedMedia] = useState<MediaDto | null>(null);
  const [loadedMediaByCategory, setLoadedMediaByCategory] = useState<Record<string, MediaDto[]>>(
    {}
  );
  const [playable, setPlayable] = useState<PlayableRef | null>(null);
  const [realtimePreparation, setRealtimePreparation] = useState<PreloadPreparationSnapshot | null>(
    null
  );
  const [realtimeReady, setRealtimeReady] = useState(false);
  const [showTraktPrompt, setShowTraktPrompt] = useState(false);
  const traktPromptFocus = useRef<HTMLElement | null>(null);
  const traktDismissedSession = useRef<string | null>(null);
  const lastIntentSequence = useRef(0);
  const sourceCache = useRef(new Map<number, PreloadPreparationSource>());
  const lastPreparation = useRef<PreloadPreparationSnapshot | null>(null);
  const rowRefs = useRef(new Map<number, CategoryRowHandle>());
  const detailsRef = useRef<MediaDetailsHandle>(null);
  const pendingBrowseFocus = useRef<{ categoryIndex: number; mediaIndex: number } | null>(null);
  const pendingCategoryAdvance = useRef(false);
  const categoryCount = displayCategories.length;
  const realtimeRef = useRef<RealtimeClient | null>(null);
  const navigationRevision = useRef(0);
  const selectedMediaRef = useRef<MediaDto | null>(null);
  const artworkRefsRef = useRef<MediaRef[]>([]);
  selectedMediaRef.current = selectedMedia;

  const toRealtimeMedia = useCallback((media: MediaDto | null): RealtimeMediaRef | null => {
    if (!media) return null;
    return media._type === 'movie'
      ? { kind: 'movie', mediaId: media.mediaId }
      : { kind: 'show', mediaId: media.mediaId };
  }, []);

  const onMediaLoaded = useCallback((slug: string, media: MediaDto[]) => {
    setLoadedMediaByCategory(previous => {
      if (previous[slug] === media) return previous;
      return { ...previous, [slug]: media };
    });
  }, []);

  useEffect(() => {
    const activeSlugs = new Set(displayCategories.map(category => category.slug));
    setLoadedMediaByCategory(previous => {
      const next = Object.fromEntries(
        Object.entries(previous).filter(([slug]) => activeSlugs.has(slug))
      );
      return Object.keys(next).length === Object.keys(previous).length ? previous : next;
    });
  }, [displayCategories]);

  /** Publish the bounded navigation window owned by the visible rows. */
  const publishRealtimeInterest = useCallback(() => {
    const rowCount = displayCategories.length;
    if (!rowCount) return;
    const rowStart = Math.max(0, Math.min(activeCategory - 5, rowCount - 11));
    const rows: Array<Array<RealtimeMediaRef | null>> = [];
    const visible: Array<[number, number]> = [];
    let center: [number, number] | null = null;
    for (let rowIndex = rowStart; rowIndex < Math.min(rowCount, rowStart + 11); rowIndex += 1) {
      const window = rowRefs.current.get(rowIndex)?.getInterestWindow?.();
      const media = (window?.media ?? []).map(toRealtimeMedia);
      rows.push(media);
      if (
        window?.center !== null &&
        window?.center !== undefined &&
        rowIndex >= activeCategory &&
        rowIndex <= activeCategory + 1
      ) {
        const firstVisible = Math.max(
          0,
          Math.min(media.length - mediaPerPage, window.center - Math.floor(mediaPerPage / 2))
        );
        for (
          let column = firstVisible;
          column < Math.min(media.length, firstVisible + mediaPerPage);
          column += 1
        ) {
          if (media[column]) visible.push([rowIndex - rowStart, column]);
        }
      }
      if (rowIndex === activeCategory && window?.center !== null && window?.center !== undefined) {
        center = [rowIndex - rowStart, window.center];
      }
    }
    const focused = view === 'player' ? null : toRealtimeMedia(selectedMedia);
    const navigation = navigationRevision.current + 1;
    navigationRevision.current = navigation;
    realtimeRef.current?.publishFocus({
      navigationRevision: navigation,
      view,
      media: focused,
    });
    realtimeRef.current?.publishMap({
      navigationRevision: navigation,
      center: view === 'browse' ? center : null,
      mediaIds: view === 'browse' ? rows : [],
      visible: view === 'browse' ? visible : [],
    });
  }, [
    activeCategory,
    displayCategories.length,
    mediaPerPage,
    selectedMedia,
    toRealtimeMedia,
    view,
  ]);

  const handleRealtimeStatus = useCallback((message: RealtimeStatusMessage) => {
    const selected = selectedMediaRef.current;
    if (!selected || selected.mediaId !== message.mediaId) return;
    setRealtimePreparation(previous => {
      const playableRef: PlayableRef =
        selected._type === 'movie'
          ? { kind: 'movie', mediaId: selected.mediaId }
          : { kind: 'show', mediaId: selected.mediaId };
      const base = previous ?? {
        playable: playableRef,
        state: 'checking' as const,
        source: null,
        warmup: { state: 'not_requested' as const },
      };
      if (message.type === 'source-status') {
        return {
          ...base,
          state: message.status as PreloadPreparationSnapshot['state'],
          source: message.sourceId
            ? {
                id: message.sourceId,
                quality: message.quality as PreloadPreparationSource['quality'],
                sourceType: message.source as PreloadPreparationSource['sourceType'],
              }
            : null,
        };
      }
      return {
        ...base,
        playable: message.playable as PlayableRef,
        warmup: {
          state: message.status as PreloadPreparationSnapshot['warmup']['state'],
          progress: message.loaded ?? undefined,
          verifiedBytes: message.verifiedBytes ?? undefined,
          targetBytes: message.targetBytes ?? undefined,
        },
      };
    });
  }, []);

  useEffect(() => {
    if (!sessionId || !currentUser) {
      setShowTraktPrompt(false);
      return;
    }
    let cancelled = false;
    void getTraktAssociation(sessionId).then(result => {
      if (cancelled || !('data' in result) || result.data.connected) return;
      const permanentKey = `miauflix:trakt:dont-ask:${currentUser.id}`;
      const permanentlyDismissed = window.localStorage.getItem(permanentKey) === '1';
      const dismissedForSession = traktDismissedSession.current === sessionId;
      if (!permanentlyDismissed && !dismissedForSession) {
        traktPromptFocus.current = document.activeElement as HTMLElement | null;
        setShowTraktPrompt(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser, sessionId]);

  useEffect(() => {
    dispatch(progressApi.util.resetApiState());
    if (!sessionId) return;
    const subscription = dispatch(
      progressApi.endpoints.getProgress.initiate(undefined, {
        forceRefetch: true,
        subscriptionOptions: { pollingInterval: 60_000, skipPollingIfUnfocused: true },
      })
    );
    return () => subscription?.unsubscribe?.();
  }, [dispatch, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      realtimeRef.current?.stop();
      realtimeRef.current = null;
      return;
    }
    setRealtimeReady(false);
    const client = new RealtimeClient(
      sessionId,
      PRELOAD_CLIENT_ID,
      message => handleRealtimeStatus(message),
      ready => {
        setRealtimeReady(ready);
        if (!ready) setRealtimePreparation(null);
      },
      update => dispatch(artworkActions.received(update))
    );
    realtimeRef.current = client;
    client.start();
    client.setArtworkSubscriptions(artworkRefsRef.current);
    const visibility = () => client.setVisible(document.visibilityState !== 'hidden');
    client.setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      client.stop();
      if (artworkRefsRef.current.length) {
        dispatch(artworkActions.removed(artworkRefsRef.current));
      }
      setRealtimeReady(false);
      if (realtimeRef.current === client) realtimeRef.current = null;
    };
  }, [dispatch, handleRealtimeStatus, sessionId]);

  const artworkRefs = useMemo(() => {
    const byKey = new Map<string, MediaRef>();
    const add = (media: MediaDto | null | undefined) => {
      if (!media) return;
      const mediaType = media._type === 'movie' ? 'movie' : 'tv';
      byKey.set(`${mediaType}:${media.mediaId}`, { mediaType, mediaId: media.mediaId });
    };
    add(selectedMedia);
    for (const media of continueMedia) add(media);
    for (const media of Object.values(loadedMediaByCategory).flat()) add(media);
    return [...byKey.values()].slice(0, 5_000);
  }, [continueMedia, loadedMediaByCategory, selectedMedia]);

  useEffect(() => {
    const previous = new Map(
      artworkRefsRef.current.map(ref => [`${ref.mediaType}:${ref.mediaId}`, ref])
    );
    const next = new Map(artworkRefs.map(ref => [`${ref.mediaType}:${ref.mediaId}`, ref]));
    const removed = [...previous].filter(([key]) => !next.has(key)).map(([, ref]) => ref);
    realtimeRef.current?.setArtworkSubscriptions(artworkRefs);
    if (removed.length) dispatch(artworkActions.removed(removed));
    artworkRefsRef.current = artworkRefs;
  }, [artworkRefs, dispatch]);

  useEffect(() => {
    const retained = [
      ...continueMedia,
      ...Object.values(loadedMediaByCategory).flat(),
      ...(selectedMedia ? [selectedMedia] : []),
    ];
    for (const media of retained) {
      const update: ArtworkUpdate = {
        mediaType: media._type === 'movie' ? 'movie' : 'tv',
        mediaId: media.mediaId,
        backdrop: media.backdrop ?? '',
        logo: media.logo ?? '',
        heroLogo: media.heroLogo ?? media.logo ?? '',
        artworkRevision: media.artworkRevision ?? 0,
        cardLogoStatus: media.cardLogoStatus ?? 'pending',
        heroLogoStatus: media.heroLogoStatus ?? 'pending',
      };
      dispatch(artworkActions.received(update));
    }
  }, [continueMedia, dispatch, loadedMediaByCategory, selectedMedia]);

  useEffect(() => {
    // These queries supply rendered cards, so retain their data while the row needs it.
    const subscriptions = continueHydrationKeys.map(key => {
      const [kind, mediaId] = key.split(':');
      return kind === 'movie'
        ? dispatch(mediaApi.endpoints.getMovie.initiate(Number(mediaId)))
        : dispatch(mediaApi.endpoints.getShow.initiate(Number(mediaId)));
    });
    return () => subscriptions.forEach(subscription => subscription?.unsubscribe?.());
  }, [continueHydrationKeys, dispatch]);

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
    if (
      !pendingCategoryAdvance.current ||
      activeCategoryRef.current + 1 >= displayCategories.length
    )
      return;
    pendingCategoryAdvance.current = false;
    activeCategoryRef.current += 1;
    setActiveCategory(activeCategoryRef.current);
  }, [displayCategories.length]);

  const handleContentScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      publishRealtimeInterest();
      if (!hasNextPage || isFetchingNextPage) return;
      const element = event.currentTarget;
      if (
        element.scrollTop + element.clientHeight >=
        element.scrollHeight - element.clientHeight * 2
      )
        void fetchNextPage();
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage, publishRealtimeInterest]
  );

  useEffect(() => {
    publishRealtimeInterest();
  }, [publishRealtimeInterest]);

  const focusedMediaId = selectedMedia?.mediaId;
  const focusedMediaKind = selectedMedia
    ? selectedMedia._type === 'movie'
      ? 'movie'
      : 'show'
    : null;

  useEffect(() => {
    if (!sessionId || focusedMediaId === undefined || !focusedMediaKind) return;
    dispatch(
      mediaApi.util.prefetch(
        focusedMediaKind === 'movie' ? 'getMovie' : 'getShow',
        focusedMediaId,
        {
          ifOlderThan: 30,
        }
      )
    );
  }, [dispatch, focusedMediaId, focusedMediaKind, sessionId]);

  useEffect(() => {
    if (!sessionId || realtimeReady || focusedMediaId === undefined || !focusedMediaKind) return;
    // Catalog updates can recreate card DTOs; only a focus change renews the lease early.
    const focused = { kind: focusedMediaKind, mediaId: focusedMediaId };
    const publish = () => {
      if (document.visibilityState === 'hidden') return;
      const sequence = nextPreloadSequence();
      lastIntentSequence.current = sequence;
      void updateIntent({
        clientId: PRELOAD_CLIENT_ID,
        intent: {
          sequence,
          view: view === 'player' ? 'player' : view === 'details' ? 'details' : 'browse',
          focused: view === 'player' ? null : focused,
          reachable: [],
        },
      });
    };
    publish();
    const heartbeat = window.setInterval(publish, 5_000);
    return () => window.clearInterval(heartbeat);
  }, [focusedMediaId, focusedMediaKind, realtimeReady, sessionId, updateIntent, view]);

  // Keep the same lease when browsing transitions to details, so discovered
  // source metadata survives the escalation to torrent warmup.
  useEffect(() => {
    if (!sessionId) return;
    return () => {
      void removeIntent({
        clientId: PRELOAD_CLIENT_ID,
        sequence: lastIntentSequence.current,
        session: sessionId,
      });
    };
  }, [removeIntent, sessionId]);

  const handleActive = useCallback(
    (categoryIndex: number, mediaIndex: number, media: MediaDto) => {
      activeCategoryRef.current = categoryIndex;
      setActiveCategory(categoryIndex);
      setSelectedMedia(media);
      setRealtimePreparation(previous =>
        previous &&
        media._type === 'movie' &&
        previous.playable.kind === 'movie' &&
        previous.playable.mediaId === media.mediaId
          ? previous
          : null
      );
      setSelectedByCategory(previous => {
        const slug = displayCategories?.[categoryIndex]?.slug;
        return slug && previous[slug] !== mediaIndex
          ? { ...previous, [slug]: mediaIndex }
          : previous;
      });
    },
    [displayCategories]
  );

  const openDetails = useCallback((media: MediaDto) => {
    setSelectedMedia(media);
    setRealtimePreparation(previous =>
      previous &&
      media._type === 'movie' &&
      previous.playable.kind === 'movie' &&
      previous.playable.mediaId === media.mediaId
        ? previous
        : null
    );
    setView('details');
    setActiveRegion('details');
  }, []);

  const handleMoveCategory = useCallback(
    (delta: -1 | 1) => {
      if (!displayCategories?.length) return;
      let nextCategory = activeCategoryRef.current + delta;
      if (nextCategory >= displayCategories.length && delta === 1 && hasNextPage) {
        pendingCategoryAdvance.current = true;
        if (!isFetchingNextPage) void fetchNextPage();
        return;
      }
      let destinationPending = false;
      while (nextCategory >= 0 && nextCategory < displayCategories.length) {
        const row = rowRefs.current.get(nextCategory);
        const selectedIndex = selectedByCategory[displayCategories[nextCategory].slug] ?? 0;
        if (row?.focusIndex(selectedIndex)) break;
        destinationPending = true;
        if (!row || !row.isEmpty()) break;
        nextCategory += delta;
      }
      if (nextCategory < 0 || nextCategory >= displayCategories.length) return;
      if (nextCategory === activeCategoryRef.current) return;
      activeCategoryRef.current = nextCategory;
      setActiveCategory(nextCategory);
      if (destinationPending) {
        pageRef.current?.focus({ preventScroll: true });
      }
    },
    [displayCategories, fetchNextPage, hasNextPage, isFetchingNextPage, selectedByCategory]
  );

  const returnToBrowse = useCallback(() => {
    const categoryIndex = activeCategoryRef.current;
    const category = displayCategories?.[categoryIndex];
    pendingBrowseFocus.current = {
      categoryIndex,
      mediaIndex: category ? (selectedByCategory[category.slug] ?? 0) : 0,
    };
    setView('browse');
    setActiveRegion('carousel');
  }, [displayCategories, selectedByCategory]);

  const returnToDetails = useCallback(() => {
    setView('details');
    setActiveRegion('details');
  }, []);

  const openPlayer = useCallback((nextPlayable: PlayableRef) => {
    setPlayable(nextPlayable);
    setView('player');
    setActiveRegion('player');
  }, []);

  const openSettings = useCallback(() => {
    window.dispatchEvent(new Event('miauflix:settings:open'));
  }, []);

  const dismissTraktPrompt = useCallback(
    (permanent: boolean) => {
      if (currentUser && sessionId) {
        if (permanent) {
          window.localStorage.setItem(`miauflix:trakt:dont-ask:${currentUser.id}`, '1');
        } else {
          traktDismissedSession.current = sessionId;
        }
      }
      setShowTraktPrompt(false);
      requestAnimationFrame(() => traktPromptFocus.current?.focus({ preventScroll: true }));
    },
    [currentUser, sessionId]
  );

  const handleTraktConnected = useCallback(() => {
    dispatch(progressApi.util.invalidateTags(['Progress']));
    setShowTraktPrompt(false);
    requestAnimationFrame(() => traktPromptFocus.current?.focus({ preventScroll: true }));
  }, [dispatch]);

  if (intentState.data) {
    lastPreparation.current = intentState.data.preparation ?? null;
  }
  const responsePreparation =
    realtimePreparation ??
    (intentState.data
      ? intentState.data.preparation
      : intentState.isLoading
        ? lastPreparation.current
        : undefined);
  useEffect(() => {
    if (responsePreparation?.playable.kind !== 'movie') return;
    const mediaId = responsePreparation.playable.mediaId;
    if (responsePreparation.source) {
      sourceCache.current.delete(mediaId);
      sourceCache.current.set(mediaId, responsePreparation.source);
      if (sourceCache.current.size > 256) {
        sourceCache.current.delete(sourceCache.current.keys().next().value!);
      }
    } else if (responsePreparation.state === 'no_source') {
      sourceCache.current.delete(mediaId);
    }
  }, [responsePreparation]);

  const matchedPreparation =
    selectedMedia?._type === 'movie' &&
    responsePreparation?.playable.kind === 'movie' &&
    responsePreparation.playable.mediaId === selectedMedia.mediaId
      ? responsePreparation
      : null;
  const cachedSource =
    selectedMedia?._type === 'movie' ? sourceCache.current.get(selectedMedia.mediaId) : undefined;
  const preparation: PreloadPreparationSnapshot | null =
    cachedSource && (!matchedPreparation || matchedPreparation.state === 'checking')
      ? {
          playable: { kind: 'movie', mediaId: selectedMedia!.mediaId },
          state: 'source_found',
          source: cachedSource,
          // A prior visit's buffer may have been paused or evicted. Only current
          // backend responses can report live warmup progress.
          warmup: matchedPreparation?.warmup ?? { state: 'not_requested' },
        }
      : (matchedPreparation ??
        (selectedMedia?._type === 'movie' &&
        intentState.originalArgs?.intent.focused?.kind === 'movie' &&
        intentState.originalArgs.intent.focused.mediaId === selectedMedia.mediaId &&
        intentState.error
          ? {
              playable: { kind: 'movie', mediaId: selectedMedia.mediaId },
              state: 'error',
              source: null,
              warmup: { state: 'not_requested' },
            }
          : null));

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
        const category = displayCategories?.[activeCategory];
        rowRefs.current
          .get(activeCategory)
          ?.focusIndex(category ? (selectedByCategory[category.slug] ?? 0) : 0);
        return { type: 'handled' };
      }
      return { type: 'handled' };
    },
    [activeCategory, displayCategories, selectedByCategory]
  );

  const handleHomeAction = useCallback(
    (action: HomeAction): NavigationOutcome => {
      if (showTraktPrompt) return { type: 'ignored' };
      if (view === 'player') {
        return action === 'back' ? (returnToDetails(), { type: 'handled' }) : { type: 'ignored' };
      }
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
    [
      activeCategory,
      activeRegion,
      handleMoveCategory,
      handleSidebarAction,
      returnToBrowse,
      returnToDetails,
      showTraktPrompt,
      view,
    ]
  );

  const navigationRef = useKeyboardNavigation({
    enabled: !showTraktPrompt,
    onLeft: () => handleHomeAction('left').type !== 'ignored',
    onRight: () => handleHomeAction('right').type !== 'ignored',
    onUp: () => handleHomeAction('up').type !== 'ignored',
    onDown: () => handleHomeAction('down').type !== 'ignored',
    onConfirm: () => handleHomeAction('confirm').type !== 'ignored',
    onBack: () => handleHomeAction('back').type !== 'ignored',
  });

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
    <PageContainer
      ref={node => {
        pageRef.current = node;
        navigationRef(node);
      }}
      tabIndex={-1}
    >
      <div inert={showTraktPrompt} style={{ display: 'contents' }}>
        {view === 'browse' ? (
          <>
            <MediaHero media={selectedMedia} preparation={preparation} />
            <Content $margin={margin} onScroll={handleContentScroll}>
              {displayCategories.map((category, index) => (
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
                  active={
                    !showTraktPrompt && activeRegion === 'carousel' && activeCategory === index
                  }
                  onActive={handleActive}
                  onInterest={publishRealtimeInterest}
                  onMediaLoaded={onMediaLoaded}
                  progress={progressEntries}
                  mediaOverride={
                    category.slug === CONTINUE_CATEGORY.slug ? continueMedia : undefined
                  }
                  onSelect={openDetails}
                />
              ))}
            </Content>
            <HomeSidebar
              active={!showTraktPrompt && activeRegion === 'sidebar'}
              onAction={handleSidebarAction}
              onHover={() => setActiveRegion('sidebar')}
              onSettings={openSettings}
            />
          </>
        ) : view === 'details' && selectedMedia ? (
          <MediaDetails
            ref={detailsRef}
            media={selectedMedia}
            onBack={returnToBrowse}
            onWatch={openPlayer}
            preparation={preparation}
          />
        ) : view === 'player' && playable ? (
          <PlayerView
            playable={playable}
            title={selectedMedia ? getMediaTitle(selectedMedia) : 'Selected title'}
            onBack={returnToDetails}
            realtimeClient={realtimeRef.current}
          />
        ) : null}
      </div>
      {showTraktPrompt && sessionId && (
        <TraktModal
          sessionId={sessionId}
          onConnected={handleTraktConnected}
          onDismiss={dismissTraktPrompt}
        />
      )}
    </PageContainer>
  );
};

export default HomePage;
