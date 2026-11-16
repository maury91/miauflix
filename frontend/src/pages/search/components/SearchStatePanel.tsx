import { Button, Disclosure, EmptyState, Message, Text } from '@shared/design-system';
import { presentError } from '@shared/lib/api-error';
import { FocusGroup } from '@shared/navigation';
import type { ReactNode } from 'react';

import { SEARCH_NAV } from '../searchNav';
import { searchPanelKind, type SearchStatus } from './searchPanel';
import * as styles from './searchStatePanel.css';

import WarningIcon from '~icons/mdi/alert-outline';
import SearchIcon from '~icons/mdi/magnify';

function technicalDetails(error: unknown): { label: string; value: ReactNode }[] {
  const presentation = presentError(error, '');
  if (presentation.code === undefined) return [];
  const items: { label: string; value: ReactNode }[] = [];
  if (presentation.message) items.push({ label: 'Error', value: presentation.message });
  if (presentation.detail)
    items.push({ label: 'Server error', value: <code>{presentation.detail}</code> });
  items.push({ label: 'Code', value: <code>{presentation.code}</code> });
  if (presentation.errorId)
    items.push({ label: 'Error id', value: <code>{presentation.errorId}</code> });
  return items;
}

interface SearchStatePanelProps {
  status: SearchStatus;
  error: unknown;
  query: string;
  isGenre: boolean;
  resultCount: number;
  onRetry: () => void;
  onClear: () => void;
}

/**
 * "No results" or "unavailable" in place of the results row, with what to do next: an EmptyState
 * whose action is the `search-panel` group's first item, then (for a failure the server explained)
 * the technical details, collapsed.
 */
export function SearchStatePanel({
  status,
  error,
  query,
  isGenre,
  resultCount,
  onRetry,
  onClear,
}: SearchStatePanelProps) {
  const kind = searchPanelKind(status, resultCount);
  if (!kind) return null;

  if (kind === 'empty') {
    return (
      <FocusGroup id={SEARCH_NAV.panel} layout="vertical">
        <EmptyState
          visual={<SearchIcon />}
          heading={
            isGenre ? `Nothing popular in “${query}” yet` : `No results for ‘${query.trim()}’`
          }
          actions={
            <Button navId={SEARCH_NAV.panelAction} onClick={onClear}>
              Clear search
            </Button>
          }
        >
          {isGenre ? 'Try another genre.' : 'Try a shorter title or check the spelling.'}
        </EmptyState>
      </FocusGroup>
    );
  }

  const presentation = presentError(error, '');
  const items = technicalDetails(error);
  // Something an admin can fix is spelled out; anything else stays short, with the details
  // (and the error id to search the logs for) one press away.
  const title = presentation.needsConfiguration
    ? 'Search needs to be set up'
    : 'Search is temporarily unavailable';
  const description =
    presentation.needsConfiguration || presentation.code === 'service_unavailable'
      ? presentation.message
      : 'Try again in a moment.';
  return (
    <FocusGroup id={SEARCH_NAV.panel} layout="vertical">
      <div role="alert">
        <EmptyState
          visual={<WarningIcon />}
          heading={title}
          message={
            presentation.needsConfiguration && presentation.hint ? (
              <Message tone="warning">{presentation.hint}</Message>
            ) : undefined
          }
          actions={
            <Button navId={SEARCH_NAV.panelAction} onClick={onRetry}>
              Try again
            </Button>
          }
        >
          {description}
        </EmptyState>
      </div>
      {items.length > 0 && (
        <div className={styles.details}>
          <Disclosure navId={SEARCH_NAV.panelDetails} title="Technical details" headingLevel={3}>
            <dl className={styles.list}>
              {items.map(item => (
                <div key={item.label} className={styles.item}>
                  <dt className={styles.term}>
                    <Text as="span" tone="secondary">
                      {item.label}
                    </Text>
                  </dt>
                  <dd className={styles.value}>
                    <Text as="span">{item.value}</Text>
                  </dd>
                </div>
              ))}
            </dl>
            <Text tone="secondary" variant="caption">
              Search the server logs (docker logs) for the error id; the browser console has the
              full response.
            </Text>
          </Disclosure>
        </div>
      )}
    </FocusGroup>
  );
}
