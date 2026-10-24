import { mediaApi } from '@features/media/api/media.api';
import type { SeasonResponse } from '@miauflix/backend';
import type { AppDispatch, RootState } from '@store/store';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';

type SeasonQuery = ReturnType<ReturnType<typeof mediaApi.endpoints.getSeason.select>>;

/**
 * A show's seasons as the details page needs them, straight from the RTK Query cache: the
 * opening season and any the page asked for stay subscribed while it is open, and their data,
 * loading and errors are the queries' own status.
 */
export function useShowSeasons({
  showId,
  seasonNumbers,
  openingSeason,
}: {
  showId: number | null;
  /** Every season the show has, in display order. */
  seasonNumbers: readonly number[];
  openingSeason: number | undefined;
}) {
  const dispatch = useDispatch<AppDispatch>();
  // Tied to the show: a different show starts with nothing requested.
  const [requested, setRequested] = useState<{ showId: number | null; seasons: number[] }>({
    showId,
    seasons: [],
  });
  const wanted = useMemo(() => {
    const seasons = new Set(requested.showId === showId ? requested.seasons : []);
    if (openingSeason !== undefined) seasons.add(openingSeason);
    return [...seasons].sort((left, right) => left - right);
  }, [openingSeason, requested, showId]);
  const wantedKey = wanted.join(',');

  useEffect(() => {
    if (showId === null || !wantedKey) return undefined;
    const subscriptions = wantedKey
      .split(',')
      .map(season =>
        dispatch(mediaApi.endpoints.getSeason.initiate({ showId, season: Number(season) }))
      );
    return () => subscriptions.forEach(subscription => subscription.unsubscribe());
  }, [dispatch, showId, wantedKey]);

  const selectQueries = useMemo(() => {
    const selectors =
      showId === null
        ? []
        : seasonNumbers.map(
            season => [season, mediaApi.endpoints.getSeason.select({ showId, season })] as const
          );
    return (state: RootState) =>
      Object.fromEntries(selectors.map(([season, select]) => [season, select(state)])) as Record<
        number,
        SeasonQuery
      >;
  }, [seasonNumbers, showId]);
  const queries = useSelector(selectQueries, shallowEqual);

  const loaded = useMemo(() => {
    const byNumber: Record<number, SeasonResponse> = {};
    for (const season of seasonNumbers) {
      const data = queries[season]?.data;
      if (data) byNumber[season] = data;
    }
    return byNumber;
  }, [queries, seasonNumbers]);
  const loadedSections = useMemo(
    () => seasonNumbers.flatMap(season => (loaded[season] ? [loaded[season]] : [])),
    [loaded, seasonNumbers]
  );

  /** Keep a season loaded for this page (already cached seasons cost nothing). */
  const request = useCallback(
    (season: number) =>
      setRequested(previous => {
        const current = previous.showId === showId ? previous.seasons : [];
        return current.includes(season) ? previous : { showId, seasons: [...current, season] };
      }),
    [showId]
  );

  /** Load a season again after it failed. */
  const retry = useCallback(
    (season: number) => {
      request(season);
      if (showId === null) return;
      const attempt = dispatch(
        mediaApi.endpoints.getSeason.initiate({ showId, season }, { forceRefetch: true })
      );
      const release = () => attempt.unsubscribe();
      void attempt.unwrap().then(release, release);
    },
    [dispatch, request, showId]
  );

  return {
    loaded,
    loadedSections,
    /** A wanted season is still on its way. */
    loading: wanted.some(season => !loaded[season] && queries[season]?.status !== 'rejected'),
    /** Wanted seasons whose last load failed and that have nothing to show. */
    failedSeasons: wanted.filter(season => !loaded[season] && queries[season]?.isError),
    request,
    retry,
  };
}
