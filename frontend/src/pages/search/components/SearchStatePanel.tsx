import { presentError } from '@shared/lib/api-error';
import { StatePanel, type StatePanelDetail } from '@shared/ui/state-panel/StatePanel';
import type { FC } from 'react';
import styled from 'styled-components';

import { searchPanelKind, type SearchStatus } from './searchPanel';

function technicalDetails(error: unknown): StatePanelDetail[] {
  const presentation = presentError(error, '');
  if (presentation.code === undefined) return [];
  const items: StatePanelDetail[] = [];
  if (presentation.message) items.push({ label: 'Error', value: presentation.message });
  if (presentation.detail)
    items.push({ label: 'Server error', value: <code>{presentation.detail}</code> });
  items.push({ label: 'Code', value: <code>{presentation.code}</code> });
  if (presentation.errorId)
    items.push({ label: 'Error id', value: <code>{presentation.errorId}</code> });
  return items;
}

// The search page sizes text in vw; the panel scales with this.
const Area = styled.div`
  margin-top: 1vh;
  font-size: 1.15vw;
`;

interface SearchStatePanelProps {
  status: SearchStatus;
  error: unknown;
  query: string;
  isGenre: boolean;
  resultCount: number;
  /** Focused action (0: main action, 1: technical details), or null. */
  focusedIndex: number | null;
  onFocusAction: (index: number) => void;
  registerAction: (index: number, element: HTMLButtonElement | null) => void;
  onRetry: () => void;
  onClear: () => void;
}

/** "No results" or "unavailable" in place of the results row, with what to do next. */
export const SearchStatePanel: FC<SearchStatePanelProps> = ({
  status,
  error,
  query,
  isGenre,
  resultCount,
  focusedIndex,
  onFocusAction,
  registerAction,
  onRetry,
  onClear,
}) => {
  const kind = searchPanelKind(status, resultCount);
  if (!kind) return null;
  const actionProps = (index: number) => ({
    focused: focusedIndex === index,
    onFocus: () => onFocusAction(index),
    ref: (element: HTMLButtonElement | null) => registerAction(index, element),
  });

  if (kind === 'empty') {
    return (
      <Area>
        <StatePanel
          icon="search"
          title={isGenre ? `Nothing popular in “${query}” yet` : `No results for ‘${query.trim()}’`}
          description={
            isGenre ? 'Try another genre.' : 'Try a shorter title or check the spelling.'
          }
          action={{ label: 'Clear search', onClick: onClear, ...actionProps(0) }}
        />
      </Area>
    );
  }

  const presentation = presentError(error, '');
  const items = technicalDetails(error);
  // Something an admin can fix is spelled out; anything else stays short, with the details
  // (and the error id to search the logs for) one press away.
  const title = presentation.needsConfiguration
    ? 'Search needs to be set up'
    : 'Search is temporarily unavailable';
  const description = presentation.needsConfiguration
    ? presentation.message
    : presentation.code === 'service_unavailable'
      ? presentation.message
      : 'Try again in a moment.';
  return (
    <Area>
      <StatePanel
        role="alert"
        icon="warning"
        title={title}
        description={description}
        hint={presentation.needsConfiguration ? presentation.hint : undefined}
        action={{ label: 'Try again', onClick: onRetry, ...actionProps(0) }}
        details={
          items.length
            ? {
                items,
                note: 'Search the server logs (docker logs) for the error id; the browser console has the full response.',
                toggle: actionProps(1),
              }
            : undefined
        }
      />
    </Area>
  );
};
