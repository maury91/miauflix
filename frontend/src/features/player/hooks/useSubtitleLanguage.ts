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
  select: (id: string | null) => void;
  search: (language: string, hearingImpaired: boolean, options?: SubtitleSearchOptions) => unknown;
}

/**
 * Shows subtitles in a language (a track of it, searched for if none is at hand), or none for
 * null: what the language buttons under the seek bar ask for.
 */
export function useSubtitleLanguage({ candidates, selectedId, select, search }: Subtitles) {
  return useCallback(
    (language: string | null) => {
      if (language === null) {
        select(null);
        return;
      }
      const inLanguage = (candidate: SubtitleCandidateDto) =>
        mediaLanguage(candidate.language) === language;
      const current = candidates.find(candidate => candidate.id === selectedId);
      if (current && inLanguage(current)) return;
      const found = candidates.find(inLanguage);
      if (found) select(found.id);
      else void search(language, false, { autoSelect: true });
    },
    [candidates, search, select, selectedId]
  );
}
