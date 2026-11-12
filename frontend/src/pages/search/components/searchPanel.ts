import { presentError } from '@shared/lib/api-error';

export type SearchStatus = 'error' | 'idle' | 'loading' | 'ready';

/** Which panel replaces the results row, if any. */
export function searchPanelKind(
  status: SearchStatus,
  resultCount: number
): 'empty' | 'error' | null {
  if (resultCount > 0) return null;
  if (status === 'error') return 'error';
  return status === 'ready' ? 'empty' : null;
}

/** Whether a failure carries details from the server worth a "Technical details" toggle. */
export const hasTechnicalDetails = (error: unknown): boolean =>
  presentError(error, '').code !== undefined;

/** Focusable actions in the panel: the main action, then "Technical details" when there are any. */
export function searchPanelActionCount(
  status: SearchStatus,
  resultCount: number,
  error: unknown
): number {
  const kind = searchPanelKind(status, resultCount);
  if (!kind) return 0;
  return kind === 'error' && hasTechnicalDetails(error) ? 2 : 1;
}
