import type { SearchResultDetailDto, SearchResultDto } from '@miauflix/backend';
import { ErrorNotice } from '@shared/components';
import { Heading, MediaTile, Message, Text } from '@shared/design-system';
import { useT } from '@shared/i18n';
import { artworkUrl, formatRuntime } from '@shared/lib/media.utils';
import { FocusGroup, useActiveIdWithin } from '@shared/navigation';
import { searchResultKey } from '@store/slices/search';
import { useEffect, useRef } from 'react';

import { SEARCH_NAV } from '../searchNav';
import { searchPanelKind } from './searchPanel';
import * as styles from './searchResults.css';
import { SearchStatePanel } from './SearchStatePanel';

/** The tile's supporting line: seasons or runtime, year and rating ("2021 · 2h 35m · ★ 8.0"). */
function resultMeta(
  result: SearchResultDto,
  detail: SearchResultDetailDto | undefined
): string | undefined {
  const parts: string[] = [];
  const year = result.releaseDate.slice(0, 4);
  if (result._type === 'tvshow' && detail?.seasonCount) parts.push(`S${detail.seasonCount}`);
  if (year) parts.push(year);
  if (result._type === 'movie' && detail?.runtime) parts.push(formatRuntime(detail.runtime));
  if (result.rating > 0) parts.push(`★ ${result.rating.toFixed(1)}`);
  return parts.length ? parts.join(' · ') : undefined;
}

interface SearchResultsProps {
  heading: string;
  status: 'error' | 'idle' | 'loading' | 'ready';
  /** Why the search failed, when it did. */
  error?: unknown;
  results: SearchResultDto[];
  details: Record<string, SearchResultDetailDto>;
  totalResults: number;
  /** More pages to come: a move past the last tile waits on the next one. */
  hasMore: boolean;
  onLoadMore: () => void;
  onOpen: (index: number) => void;
  /** What was searched, for the no-results panel. */
  query: string;
  isGenre: boolean;
  onRetry: () => void;
  onClear: () => void;
}

/**
 * The results mosaic (the `search-results` grid group of Home's landscape MediaTiles, scrolled down
 * to reveal the focused one); keeps the previous results visible while a new search is loading.
 * Without results, the state panel takes its place.
 */
export function SearchResults({
  heading,
  status,
  error,
  results,
  details,
  totalResults,
  hasMore,
  onLoadMore,
  onOpen,
  query,
  isGenre,
  onRetry,
  onClear,
}: SearchResultsProps) {
  const t = useT();
  const panel = searchPanelKind(status, results.length);
  const tilePixels =
    typeof window === 'undefined' ? 200 : (window.innerWidth * styles.TILE_WIDTH_VW) / 100;
  const tiles = useRef(new Map<string, HTMLElement>());
  const activeId = useActiveIdWithin(SEARCH_NAV.results);

  // The layer focuses without scrolling: bring the focused tile's row into view
  useEffect(() => {
    if (activeId) tiles.current.get(activeId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeId]);

  return (
    <section className={styles.section} aria-label={heading} aria-busy={status === 'loading'}>
      {/* The panel says what happened, so it replaces the heading. */}
      {!panel && (
        <div className={styles.header}>
          <Heading level={2} variant="heading">
            {heading}
          </Heading>
          {status === 'ready' && totalResults > 0 && (
            <div className={styles.count}>
              <Text as="span" tone="secondary">
                {t('search.resultCount', { count: totalResults })}
              </Text>
            </div>
          )}
        </div>
      )}
      <SearchStatePanel
        status={status}
        error={error}
        query={query}
        isGenre={isGenre}
        resultCount={results.length}
        onRetry={onRetry}
        onClear={onClear}
      />
      {results.length > 0 && (status === 'error' || error != null) && (
        <div className={styles.notice}>
          {/* Polite: a later page can fail while focus stays on a tile */}
          <Message tone="warning" live="polite">
            <ErrorNotice error={error} fallback={t('search.partFailed')} />
          </Message>
        </div>
      )}
      {status === 'loading' && !results.length && (
        <Text role="status" tone="secondary">
          {t('search.searching')}
        </Text>
      )}
      {results.length > 0 && (
        <FocusGroup
          id={SEARCH_NAV.results}
          layout="grid"
          columns={styles.RESULT_COLUMNS}
          more={{ end: hasMore }}
          onMore={onLoadMore}
        >
          <div className={styles.mosaic}>
            {results.map((result, index) => {
              const key = searchResultKey(result);
              const navId = SEARCH_NAV.result(key);
              const logo = details[key]?.logo;
              return (
                <div key={key} className={styles.cell}>
                  <MediaTile
                    ref={element => {
                      if (element) tiles.current.set(navId, element);
                      else tiles.current.delete(navId);
                    }}
                    navId={navId}
                    title={result.title}
                    supportingText={resultMeta(result, details[key])}
                    artwork={
                      result.backdrop ? artworkUrl(result.backdrop, 'card', tilePixels) : null
                    }
                    logo={logo ? artworkUrl(logo, 'logo', tilePixels * 0.7) : null}
                    labelPlacement="overlay"
                    onClick={() => onOpen(index)}
                  />
                </div>
              );
            })}
          </div>
        </FocusGroup>
      )}
    </section>
  );
}
