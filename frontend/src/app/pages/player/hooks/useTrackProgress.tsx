import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@store/store';
import { useTrackMediaProgressMutation } from '@store/api/progress';
import { ProgressRequest } from '@miauflix/backend-client';
import { setMediaProgress } from '@store/slices/resume';
import { Player, PlayerStatus } from '../playerClassAbstract';

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
    setInterval(() => {
      if (!status) {
        return;
      }
      switch (status) {
        case 'PLAYING':
          updateProgress({
            progress: Math.round(player.played() * 100) / 100,
            status: 'watching',
          });
          break;
        case 'PAUSED':
          if (statusChangeUpdate) {
            updateProgress({
              status: 'paused',
              progress: (player.played() * 100) / player.videoLength(),
            });
          }
          break;
        case 'NONE':
          if (statusChangeUpdate) {
            updateProgress({
              status: 'paused',
              progress: (player.played() * 100) / player.videoLength(),
            });
          }
          break;
      }
      statusChangeUpdate = true;
    }, 3000);
    player.on('status', playerStatus => {
      status = playerStatus;
      statusChangeUpdate = false;
      if (playerStatus === 'PLAYING') {
        updateProgress({
          status: 'watching',
          progress: (player.played() * 100) / player.videoLength(),
        });
      }
      if (playerStatus === 'PAUSED') {
        updateProgress({
          status: 'paused',
          progress: (player.played() * 100) / player.videoLength(),
        });
      }
      if (playerStatus === 'NONE') {
        updateProgress({
          status: 'paused',
          progress: (player.played() * 100) / player.videoLength(),
        });
      }
    });
  }, [mediaType, player, updateProgress]);
};
