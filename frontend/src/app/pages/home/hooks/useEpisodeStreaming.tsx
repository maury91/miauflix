import { useMemo } from 'react';
import { useGetStreamingKeyMutation } from '@store/api/movies';
import { DISABLE_STREAMING, IS_TIZEN } from '@/consts';
import { getStreamUrl } from '@/store/api/medias';
import type { Quality } from '@miauflix/backend-client';

export const useEpisodeStreaming = (
  episodeId: number | null,
  quality: Quality | 'auto' = 'auto'
) => {
  const [getStreamingKey, { data: streamDetails, isLoading }] = useGetStreamingKeyMutation();

  const streamInfo = useMemo(() => {
    if (typeof episodeId === 'number' && !DISABLE_STREAMING) {
      getStreamingKey({ id: String(episodeId), quality });
    }
    return streamDetails;
  }, [episodeId, getStreamingKey, streamDetails]);

  // Get stream URL from streaming key
  const streamUrl = useMemo(() => {
    if (streamInfo?.streamingKey) {
      return getStreamUrl(streamInfo.streamingKey, quality, IS_TIZEN);
    }
    return null;
  }, [streamInfo]);

  return useMemo(
    () => ({
      streamInfo,
      streamUrl,
      isLoading,
    }),
    [streamInfo, streamUrl, isLoading]
  );
};
