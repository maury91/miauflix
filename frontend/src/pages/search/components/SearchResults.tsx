import type { SearchResultDetailDto, SearchResultDto } from '@miauflix/backend';
import { PALETTE } from '@shared/config/constants';
import { formatRuntime } from '@shared/lib/media.utils';
import { artworkUrl } from '@shared/lib/media.utils';
import { ErrorNotice, PosterCard } from '@shared/ui';
import { MetadataDot, MetadataRating } from '@shared/ui/metadata/metadata.styles';
import { searchResultKey } from '@store/slices/search';
import { type FC, Fragment, type ReactNode } from 'react';
import styled from 'styled-components';

import { SectionTitle } from './search.styles';
import { searchPanelKind } from './searchPanel';
import { SearchStatePanel } from './SearchStatePanel';

import StarIcon from '~icons/mdi/star';

/** Poster width as a share of the viewport, matching five cards across the results column. */
const CARD_WIDTH_VW = 10.9;

const Header = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 2vw;
`;

const Count = styled.span`
  color: rgba(255, 255, 255, 0.7);
  font:
    400 1.05vw 'Poppins',
    sans-serif;
  white-space: nowrap;
`;

const Row = styled.div`
  display: flex;
  gap: 1.1vw;
  /* Room for the focus outline, which the scroll container would otherwise clip. */
  margin: -0.4vw;
  padding: 0.4vw;
  overflow-x: auto;
  overflow-y: hidden;
  font-size: 0.95vw;
  scroll-behavior: smooth;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const Message = styled.p`
  margin: 1vh 0 0;
  color: ${PALETTE.text.secondary};
  font:
    400 1.1vw 'Poppins',
    sans-serif;
`;

function resultMeta(result: SearchResultDto, detail: SearchResultDetailDto | undefined): ReactNode {
  const parts: ReactNode[] = [];
  const year = result.releaseDate.slice(0, 4);
  if (result._type === 'tvshow' && detail?.seasonCount)
    parts.push(<span>S{detail.seasonCount}</span>);
  if (year) parts.push(<span>{year}</span>);
  if (result._type === 'movie' && detail?.runtime)
    parts.push(<span>{formatRuntime(detail.runtime)}</span>);
  if (result.rating > 0)
    parts.push(
      <MetadataRating>
        <StarIcon aria-hidden="true" />
        {result.rating.toFixed(1)}
      </MetadataRating>
    );
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 && <MetadataDot />}
      {part}
    </Fragment>
  ));
}

interface SearchResultsProps {
  heading: string;
  status: 'error' | 'idle' | 'loading' | 'ready';
  /** Why the search failed, when it did. */
  error?: unknown;
  results: SearchResultDto[];
  details: Record<string, SearchResultDetailDto>;
  totalResults: number;
  focusedIndex: number | null;
  onOpen: (index: number) => void;
  onFocusResult: (index: number) => void;
  registerResult: (index: number, element: HTMLButtonElement | null) => void;
  /** What was searched, for the no-results panel. */
  query: string;
  isGenre: boolean;
  /** Focused action of the no-results / error panel, or null. */
  panelFocusedIndex: number | null;
  onFocusPanelAction: (index: number) => void;
  registerPanelAction: (index: number, element: HTMLButtonElement | null) => void;
  onRetry: () => void;
  onClear: () => void;
}

/** Results row; keeps the previous results visible while a new search is loading. */
export const SearchResults: FC<SearchResultsProps> = ({
  heading,
  status,
  error,
  results,
  details,
  totalResults,
  focusedIndex,
  onOpen,
  onFocusResult,
  registerResult,
  query,
  isGenre,
  panelFocusedIndex,
  onFocusPanelAction,
  registerPanelAction,
  onRetry,
  onClear,
}) => {
  const panel = searchPanelKind(status, results.length);
  const cardPixels =
    typeof window === 'undefined' ? 200 : (window.innerWidth * CARD_WIDTH_VW) / 100;
  return (
    <section aria-label={heading} aria-busy={status === 'loading'}>
      {/* The panel says what happened, so it replaces the heading. */}
      {!panel && (
        <Header>
          <SectionTitle>{heading}</SectionTitle>
          {status === 'ready' && totalResults > 0 && (
            <Count>
              {totalResults} {totalResults === 1 ? 'result' : 'results'}
            </Count>
          )}
        </Header>
      )}
      <SearchStatePanel
        status={status}
        error={error}
        query={query}
        isGenre={isGenre}
        resultCount={results.length}
        focusedIndex={panelFocusedIndex}
        onFocusAction={onFocusPanelAction}
        registerAction={registerPanelAction}
        onRetry={onRetry}
        onClear={onClear}
      />
      {results.length > 0 && (status === 'error' || error != null) && (
        <Message role="status">
          <ErrorNotice
            error={error}
            fallback="Part of this search failed. Try again in a moment."
          />
        </Message>
      )}
      {status === 'loading' && !results.length && <Message role="status">Searching…</Message>}
      {results.length > 0 && (
        <Row>
          {results.map((result, index) => (
            <PosterCard
              key={searchResultKey(result)}
              ref={element => registerResult(index, element)}
              poster={result.poster ? artworkUrl(result.poster, 'card', cardPixels) : ''}
              title={result.title}
              meta={resultMeta(result, details[searchResultKey(result)])}
              width={`${CARD_WIDTH_VW}vw`}
              focused={focusedIndex === index}
              tabIndex={focusedIndex === index ? 0 : -1}
              onFocus={() => onFocusResult(index)}
              onMouseEnter={() => onFocusResult(index)}
              onClick={() => onOpen(index)}
            />
          ))}
        </Row>
      )}
    </section>
  );
};
