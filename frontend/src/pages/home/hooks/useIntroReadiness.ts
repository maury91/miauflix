import { useCallback, useEffect, useRef, useState } from 'react';

import type { RowLoadState } from '../home-layout';
import { useSessionChange } from './useSessionChange';

/**
 * Home is ready to reveal when the lists and progress have loaded, every row that loads
 * (visible and prefetched) has reported its data, and the hero shows the selected title.
 * A failed list load reveals the error rather than waiting forever.
 */
export function isHomeReady({
  failed,
  listsReady,
  progressReady,
  rowSlugs,
  readyRowSlugs,
  selectedMediaId,
  heroMediaId,
}: {
  failed: boolean;
  listsReady: boolean;
  progressReady: boolean;
  /** Slugs of the rows that must have data. */
  rowSlugs: readonly string[];
  readyRowSlugs: Readonly<Record<string, true>>;
  selectedMediaId: number | null;
  /** The title the hero last finished showing; undefined until it has shown anything. */
  heroMediaId: number | null | undefined;
}): boolean {
  if (failed) return true;
  return (
    listsReady &&
    progressReady &&
    rowSlugs.every(slug => readyRowSlugs[slug]) &&
    heroMediaId === selectedMediaId
  );
}

/**
 * Track row and hero readiness and call `onHydrated` once, two frames after Home is ready,
 * so the intro reveals a painted page.
 *
 * @returns Callbacks for rows and the hero to report readiness.
 */
export function useIntroReadiness({
  onHydrated,
  sessionId,
  rowLoadState,
  categorySlugs,
  failed,
  listsReady,
  progressReady,
  selectedMediaId,
}: {
  onHydrated?: () => void;
  sessionId: string | null;
  rowLoadState: RowLoadState;
  categorySlugs: readonly string[];
  failed: boolean;
  listsReady: boolean;
  progressReady: boolean;
  selectedMediaId: number | null;
}) {
  const [readyRowSlugs, setReadyRowSlugs] = useState<Record<string, true>>({});
  const [heroMediaId, setHeroMediaId] = useState<number | null | undefined>(undefined);
  const notified = useRef(false);

  useSessionChange(sessionId, () => {
    setReadyRowSlugs({});
    setHeroMediaId(undefined);
  });

  const rowSlugs = [...rowLoadState.visible, ...rowLoadState.prefetch]
    .map(index => categorySlugs[index])
    .filter((slug): slug is string => slug !== undefined);
  const ready = isHomeReady({
    failed,
    listsReady,
    progressReady,
    rowSlugs,
    readyRowSlugs,
    selectedMediaId,
    heroMediaId,
  });

  useEffect(() => {
    if (!ready || !onHydrated || notified.current) return undefined;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        notified.current = true;
        onHydrated();
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [onHydrated, ready]);

  const onRowDataReady = useCallback((slug: string) => {
    setReadyRowSlugs(previous => (previous[slug] ? previous : { ...previous, [slug]: true }));
  }, []);
  const onHeroReady = useCallback((mediaId: number | null) => setHeroMediaId(mediaId), []);

  return { onRowDataReady, onHeroReady };
}
