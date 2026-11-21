import type { SubtitleCandidateDto } from '@miauflix/backend';
import { mediaLanguage } from '@shared/i18n';
import { useCallback } from 'react';

export interface SubtitleSearchOptions {
  /** Restoring the remembered choice: keep it and don't ask online providers again. */
  restoring?: boolean;
  /** Only tracks already at hand (embedded, the torrent's own); nothing is remembered. */
  localOnly?: boolean;
  /** Turn the first track found on when nothing remembered is among them. */
  autoSelect?: boolean;
}

interface Subtitles {
  candidates: readonly SubtitleCandidateDto[];
  selectedId: string | null;
  /** Turns a track on (or none), cancelling a search still running. */
  select: (id: string | null) => void;
  /** Stops a running search from applying its result. */
  cancelSearch: () => void;
  search: (language: string, hearingImpaired: boolean, options?: SubtitleSearchOptions) => unknown;
}

/**
 * Shows subtitles in a language (a track of it, searched for if none is at hand), or none for
 * null: what the language buttons under the seek bar ask for. The latest choice wins: one made
 * while an earlier choice's search runs cancels that search, so it can't turn its track on later.
 */
export function useSubtitleLanguage({
  candidates,
  selectedId,
  select,
  cancelSearch,
  search,
}: Subtitles) {
  return useCallback(
    (language: string | null) => {
      if (language === null) {
        select(null);
        return;
      }
      const inLanguage = (candidate: SubtitleCandidateDto) =>
        mediaLanguage(candidate.language) === language;
      const current = candidates.find(candidate => candidate.id === selectedId);
      if (current && inLanguage(current)) {
        cancelSearch();
        return;
      }
      const found = candidates.find(inLanguage);
      if (found) select(found.id);
      else void search(language, false, { autoSelect: true });
    },
    [cancelSearch, candidates, search, select, selectedId]
  );
}
