import { Player, PlayerStatus } from '../playerClassAbstract';
import { useAppDispatch, useAppSelector } from '../../../../store/store';
import { useTrackMediaProgressMutation } from '../../../../store/api/progress';
import { useCallback, useEffect } from 'react';
import { TrackPlaybackRequest } from '@miauflix/types';
import { setMediaProgress } from '../../../../store/slices/resume';

export const useTrackProgress = (player: Player) => {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(state => state.app.currentUserId);
  const mediaId = useAppSelector(state => state.stream.id);
  const mediaType = useAppSelector(state => state.stream.type);
  const [updateMediaProgress] = useTrackMediaProgressMutation();

  const updateProgress = useCallback(
    (args: Omit<TrackPlaybackRequest, 'type'>) => {
      updateMediaProgress({
        id: mediaId,
        userId,
        type: mediaType,
        ...args,
      });
      dispatch(setMediaProgress({ mediaId, progress: args.progress }));
    },
    [dispatch, mediaId, mediaType, updateMediaProgress, userId]
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
            status: 'watching',
            progress: (player.played() * 100) / player.videoLength(),
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
              status: 'stopped',
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
          status: 'stopped',
          progress: (player.played() * 100) / player.videoLength(),
        });
      }
    });
  }, [mediaType, player, updateProgress]);
};
