import { useMemo, useEffect } from 'react';
import { useGetStreamingKeyMutation } from '@store/api/movies';
import { DISABLE_STREAMING, IS_TIZEN } from '@/consts';
import { getStreamUrl } from '@/store/api/medias';
import type { Quality } from '@miauflix/backend-client';

export const useEpisodeStreaming = (
  episodeId: number | null,
  quality: Quality | 'auto' = 'auto'
) => {
  // FixMe: This can definitely be improved
  const [getStreamingKey, { data: streamDetails, isLoading }] = useGetStreamingKeyMutation();

  // Trigger the mutation when episodeId or quality changes
  useEffect(() => {
    if (typeof episodeId === 'number' && !DISABLE_STREAMING) {
      getStreamingKey({ id: String(episodeId), quality });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId, quality]);

  // Memoize streamInfo
  const streamInfo = useMemo(() => streamDetails, [streamDetails]);

  // Get stream URL from streaming key
  const streamUrl = useMemo(() => {
    if (streamInfo?.streamingKey) {
      return getStreamUrl(streamInfo.streamingKey, quality, IS_TIZEN);
    }
    return null;
  }, [streamInfo, quality]);

  return useMemo(
    () => ({
      streamInfo,
      streamUrl,
      isLoading,
    }),
    [streamInfo, streamUrl, isLoading]
  );
};
