import {
  useGetAudioSourcesQuery,
  useSearchAudioSourcesMutation,
} from '@features/player/api/playback.api';
import type { PlayableRef } from '@miauwatch/backend';
import { useCallback, useState } from 'react';

/**
 * The playable's sources and their languages, for the audio panel: loaded once the panel first
 * opens (`wanted`), and searched again in a language on request.
 */
export function useAudioSources(playable: PlayableRef) {
  const [wanted, setWanted] = useState(false);
  const sources = useGetAudioSourcesQuery({ playable }, { skip: !wanted });
  const [searchSources, search] = useSearchAudioSourcesMutation();
  const onPanelOpenChange = useCallback((open: boolean) => {
    if (open) setWanted(true);
  }, []);
  const searchLanguage = useCallback(
    (language: string) => void searchSources({ playable, language }),
    [playable, searchSources]
  );
  return {
    sources: sources.currentData?.sources,
    sourcesFailed: sources.isError && !sources.currentData,
    searching: search.isLoading,
    searchFailed: search.isError,
    searchLanguage,
    onPanelOpenChange,
  };
}
