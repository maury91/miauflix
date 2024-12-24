import { Falsy } from 'rxjs';
import { useGetStreamUrlQuery } from '../../../../store/api/medias';
import { DISABLE_STREAMING, IS_TIZEN } from '../../../../consts';
import { skipToken } from '@reduxjs/toolkit/query';
import { useMemo } from 'react';

export const useEpisodeStreaming = (episodeId: number | Falsy) => {
  const { data: streamInfo, isLoading } = useGetStreamUrlQuery(
    typeof episodeId === 'number' && !DISABLE_STREAMING
      ? {
          type: 'episode',
          id: episodeId,
          supportsHvec: IS_TIZEN, // Only Tizen supports HVEC, that may change in the future
        }
      : skipToken,
    {
      refetchOnMountOrArgChange: true,
    }
  );
  return useMemo(
    () => ({
      streamInfo,
      isLoading,
    }),
    [streamInfo, isLoading]
  );
};
