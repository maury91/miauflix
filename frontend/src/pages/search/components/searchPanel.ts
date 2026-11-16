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

/** Whether a failure carries details from the server worth a "Technical details" disclosure. */
export const hasTechnicalDetails = (error: unknown): boolean =>
  presentError(error, '').code !== undefined;
