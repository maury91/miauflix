import { useGetListsInfiniteQuery } from '@features/media/api/lists.api';
import { mediaApi } from '@features/media/api/media.api';
import { progressApi } from '@features/progress/api/progress.api';
import type { MediaDto } from '@miauflix/backend';
import type { AppDispatch, RootState } from '@store/store';
import { useCallback, useEffect, useMemo } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';

import { unfinishedProgress } from '../continue-watching';
import { composeHomeCategories } from '../home-feed';
import { cardSelector, progressTitle } from '../media-mappers';
import { useSessionChange } from './useSessionChange';

const titleKey = ({ kind, mediaId }: { kind: 'movie' | 'show'; mediaId: number }) =>
  `${kind}:${mediaId}`;

/** Lists per page; the next page is fetched once the rows shown reach the middle of the last. */
const LISTS_PAGE_SIZE = 20;
const ROWS_BEFORE_NEXT_PAGE = LISTS_PAGE_SIZE / 2;

/**
 * Home's rows: the lists page by page (fixed, then popular), and Continue watching built from
 * progress. Lists load only while browsing; progress polls while browsing.
 */
export function useHomeFeed({
  browsing,
  sessionId,
  furthestShownRow,
}: {
  browsing: boolean;
  sessionId: string | null;
  /** The lowest row focused or scrolled into view; more lists load as it nears the end. */
  furthestShownRow: number;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const {
    data: listPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useGetListsInfiniteQuery({ limit: LISTS_PAGE_SIZE }, { skip: !browsing });
  // Popular lists can shift between pages while paging; show each list once.
  const categories = useMemo(() => {
    const seen = new Set<string>();
    return (listPages?.pages.flatMap(page => page.results) ?? []).filter(
      list => !seen.has(list.slug) && Boolean(seen.add(list.slug))
    );
  }, [listPages]);

  const progressFromStore = useSelector(
    (state: RootState) => progressApi.endpoints.getProgress.select(undefined)(state).data?.progress
  );
  const progressQueryStatus = useSelector(
    (state: RootState) => progressApi.endpoints.getProgress.select(undefined)(state).status
  );
  const progressEntries = useMemo(
    () => (Array.isArray(progressFromStore) ? progressFromStore : []),
    [progressFromStore]
  );

  useSessionChange(sessionId, () => {
    dispatch(progressApi.util.resetApiState());
  });

  useEffect(() => {
    if (!sessionId || !browsing) return;
    const subscription = dispatch(
      progressApi.endpoints.getProgress.initiate(undefined, {
        subscriptionOptions: { pollingInterval: 60_000, skipPollingIfUnfocused: true },
      })
    );
    return () => subscription?.unsubscribe?.();
  }, [browsing, dispatch, sessionId]);

  const continueRefs = useMemo(() => unfinishedProgress(progressEntries), [progressEntries]);
  // Progress polling recreates entry objects even when the watched titles are unchanged. Keep
  // the metadata subscriptions keyed by media identity so polling cannot refetch every title.
  const continueHydrationSignature = continueRefs
    .map(entry => titleKey(progressTitle(entry)))
    .sort()
    .join('|');
  const continueHydrationKeys = useMemo(
    () => (continueHydrationSignature ? continueHydrationSignature.split('|') : []),
    [continueHydrationSignature]
  );
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

  // Only the Continue watching titles: selecting the whole query cache would rebuild the row
  // whenever any title loads, as the hero's does on every move. Cards are cached per response,
  // so the array compares equal while those titles are unchanged.
  // One selector per title, built when the titles change rather than on every notification.
  const cardSelectors = useMemo(
    () =>
      new Map(
        continueHydrationKeys.map(key => {
          const [kind, mediaId] = key.split(':');
          return [key, cardSelector(kind as 'movie' | 'show', Number(mediaId))] as const;
        })
      ),
    [continueHydrationKeys]
  );
  const selectContinueMedia = useCallback(
    (state: RootState) =>
      continueRefs
        .map(entry => cardSelectors.get(titleKey(progressTitle(entry)))?.(state) ?? null)
        .filter((media): media is MediaDto => Boolean(media)),
    [cardSelectors, continueRefs]
  );
  const continueMedia = useSelector(selectContinueMedia, shallowEqual);
  const displayCategories = useMemo(
    () => composeHomeCategories(categories, continueMedia.length > 0),
    [categories, continueMedia.length]
  );

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || categories.length === 0) return;
    if (furthestShownRow >= displayCategories.length - ROWS_BEFORE_NEXT_PAGE) void fetchNextPage();
  }, [
    displayCategories.length,
    fetchNextPage,
    furthestShownRow,
    hasNextPage,
    isFetchingNextPage,
    categories.length,
  ]);

  /** Ask for the next page of lists; false when there is none to load. */
  const requestNextPage = useCallback(() => {
    if (!hasNextPage) return false;
    if (!isFetchingNextPage) void fetchNextPage();
    return true;
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const listsReady = isError || (!isLoading && listPages !== undefined && !isFetchingNextPage);
  const progressReady = isError || !sessionId || progressQueryStatus !== 'pending';

  return {
    displayCategories,
    continueMedia,
    progressEntries,
    isLoading,
    isError,
    /** The lists failed or have not arrived; browsing has nothing to show. */
    failed: isError || !listPages,
    listsReady,
    progressReady,
    requestNextPage,
  };
}
