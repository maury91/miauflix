import { useCallback, useEffect } from 'react';

import { navigateTo } from '../../../store/slices/app';
import { useAppDispatch, useAppSelector } from '../../../store/store';
import { useControls } from '../../hooks/useControls';
import { PlayerInterface } from './components/playerInterface';
import { PlayerSubtitles } from './components/playerSubtitles';
import { PlayerProvider } from './context';
import { useInitialProgress } from './hooks/useInitialProgress';
import { usePlayer } from './hooks/usePlayer';
import { useTrackProgress } from './hooks/useTrackProgress';

export const Player = () => {
  const dispatch = useAppDispatch();
  const streamUrl = useAppSelector(state => state.stream.url);

  const initialPosition = useInitialProgress();
  const player = usePlayer({ initialPosition, streamUrl });
  useTrackProgress(player);

  const navigateBack = useCallback(() => {
    dispatch(navigateTo('home/details'));
    player.close();
  }, [dispatch, player]);

  const on = useControls('player');
  useEffect(() => on(['back'], navigateBack), [navigateBack, on]);

  useEffect(() => {
    return player.on('currentTime', played => {
      // at 80% of the episode ( or 2 minutes before, whatever is sooner ), if next episode is available, request a streaming url
      // 1 minute before the end of the episode, if next episode is available, show the next episode button
      // ToDo: Implement auto-next for TV shows
      if (played > 0 && played >= player.videoLength() - 500) {
        navigateBack();
      }
    });
  }, [navigateBack, player]);

  return (
    <PlayerProvider value={player}>
      {player.container}
      <PlayerInterface />
      <PlayerSubtitles />
    </PlayerProvider>
  );
};
