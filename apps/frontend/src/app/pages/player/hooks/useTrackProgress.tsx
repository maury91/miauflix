import { Player } from '../playerClassAbstract';
import { useAppDispatch, useAppSelector } from '../../../../store/store';
import { useTrackMovieProgressMutation } from '../../../../store/api/progress';
import { useCallback, useEffect } from 'react';
import { TrackPlaybackRequest } from '@miauflix/types';
import { setMediaProgress } from '../../../../store/slices/resume';

export const useTrackProgress = (player: Player) => {
  const dispatch = useAppDispatch();
  const userId = useAppSelector((state) => state.app.currentUserId);
  const mediaId = useAppSelector((state) => state.stream.id);
  const mediaType = useAppSelector((state) => state.stream.type);
  const [updateMovieProgress] = useTrackMovieProgressMutation();

  const updateProgress = useCallback(
    (args: Omit<TrackPlaybackRequest, 'type'>) => {
      updateMovieProgress({
        id: mediaId,
        userId,
        type: mediaType,
        ...args,
      });
      dispatch(setMediaProgress({ mediaId, progress: args.progress }));
    },
    [dispatch, mediaId, mediaType, updateMovieProgress, userId]
  );

  useEffect(() => {
    player.on('status', (playerStatus) => {
      if (playerStatus === 'PLAYING') {
        updateProgress({
          action: 'start',
          progress: (player.played() * 100) / player.videoLength(),
        });
      }
      if (playerStatus === 'PAUSED') {
        updateProgress({
          action: 'pause',
          progress: (player.played() * 100) / player.videoLength(),
        });
      }
      if (playerStatus === 'NONE') {
        updateProgress({
          action: 'stop',
          progress: (player.played() * 100) / player.videoLength(),
        });
      }
    });
  }, [mediaType, player, updateProgress]);
};
