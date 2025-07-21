import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@store/store';
import { useTrackMediaProgressMutation } from '@store/api/progress';
import { ProgressRequest } from '@miauflix/backend-client';
import { setMediaProgress } from '@store/slices/resume';
import { Player, PlayerStatus } from '../playerClassAbstract';

const getProgressInPercentage = (player: Player) => {
  return (player.played() * 100) / player.videoLength();
};

export const useTrackProgress = (player: Player) => {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(state => state.app.currentUserId);
  const mediaId = useAppSelector(state => state.stream.id);
  const mediaType = useAppSelector(state => state.stream.type);
  const [updateMediaProgress] = useTrackMediaProgressMutation();

  const updateProgress = useCallback(
    (args: Omit<ProgressRequest, 'type'>) => {
      updateMediaProgress({
        type: mediaType === 'episode' ? 'episode' : 'movie',
        // FixMe: Remove hardcoded values
        movieId: mediaType === 'movie' ? String(mediaId) : undefined,
        showId: mediaType === 'episode' ? String(mediaId) : undefined,
        season: mediaType === 'episode' ? 1 : undefined, // Default to season 1 for now
        episode: mediaType === 'episode' ? 1 : undefined, // Default to episode 1 for now
        ...args,
      });
      dispatch(setMediaProgress({ mediaId, progress: args.progress }));
    },
    [dispatch, mediaId, mediaType, updateMediaProgress]
  );

  useEffect(() => {
    let status: PlayerStatus | null = null;
    let statusChangeUpdate = false;
    const interval = setInterval(() => {
      if (!status) {
        return;
      }
      const progress = getProgressInPercentage(player);
      switch (status) {
        case 'PLAYING':
          updateProgress({
            status: 'watching',
            progress,
          });
          break;
        case 'PAUSED':
          if (statusChangeUpdate) {
            updateProgress({
              status: 'paused',
              progress,
            });
          }
          break;
        case 'NONE':
          if (statusChangeUpdate) {
            updateProgress({
              status: 'paused',
              progress,
            });
          }
          break;
      }
      statusChangeUpdate = true;
    }, 3000);

    const removeStatusListener = player.on('status', playerStatus => {
      status = playerStatus;
      statusChangeUpdate = false;
      const progress = getProgressInPercentage(player);
      if (playerStatus === 'PLAYING') {
        updateProgress({
          status: 'watching',
          progress,
        });
      }
      if (playerStatus === 'PAUSED') {
        updateProgress({
          status: 'paused',
          progress,
        });
      }
      if (playerStatus === 'NONE') {
        updateProgress({
          status: 'paused',
          progress,
        });
      }
    });

    return () => {
      clearInterval(interval);
      removeStatusListener();
    };
  }, [mediaType, player, updateProgress]);
};
