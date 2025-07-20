import { FC, useCallback, useEffect, useState } from 'react';
import { usePlayerContext } from '../context';
import { PlayerStatus } from '../playerClassAbstract';
import { useVirtualSeek } from '../hooks/useVirtualSeek';
import {
  BrokenStreamButton,
  PauseIcon,
  PauseOverlay,
  PlayedTime,
  PlayedTimeContainer,
  PlayerProgressBar,
  PlayerProgressBarContainer,
  PlayerProgressBubble,
  PlayPauseIcon,
  TotalTime,
} from '../ui/common';
import { useReportBrokenStreamMutation } from '@store/api/medias';
import { useAppDispatch, useAppSelector } from '@store/store';
import { getCurrentFocusKey, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { PLAYER_PAUSE_BUTTON_FOCUS_KEY } from '../consts';
import { useControls } from '../../../hooks/useControls';

const formatTime = (time: number) => {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor(time / 60) % 60;
  const seconds = Math.floor(time % 60);

  const parts = hours ? [hours, minutes, seconds] : [minutes, seconds];
  return parts.map(part => part.toString().padStart(2, '0')).join(':');
};

// ToDo: Implement downloaded bar
export const PlayerInterface: FC = () => {
  const dispatch = useAppDispatch();
  const player = usePlayerContext();
  const [showPlayerControls, setShowPlayerControls] = useState(false);
  const [status, setStatus] = useState<PlayerStatus>('NONE');
  const [videoLength, setVideoLength] = useState(0);
  const virtualPlayed = useVirtualSeek(player);
  const [markStreamAsBroken] = useReportBrokenStreamMutation();
  const [requestingNewStreamLoading, setRequestingNewStreamLoading] = useState(false);
  const oldStream = useAppSelector(state => state.stream);

  const requestNewStream = useCallback(async () => {
    player.pause();
    setRequestingNewStreamLoading(true);
    try {
      await markStreamAsBroken({
        streamingKey: oldStream.streamId,
        reason: 'User reported broken stream',
      });
      // TODO: Implement new stream request logic
      console.log('Stream reported as broken, new stream logic not implemented');
    } finally {
      setRequestingNewStreamLoading(false);
    }
  }, [dispatch, markStreamAsBroken, oldStream, player]);

  const togglePlay = useCallback(() => {
    player.togglePlay();
  }, [player]);

  useEffect(() => {
    if (showPlayerControls) {
      setFocus(PLAYER_PAUSE_BUTTON_FOCUS_KEY);
    }
  }, [showPlayerControls]);

  useEffect(() => {
    const statusListenerDestructor = player.on('status', setStatus);
    const videoLengthListenerDestructor = player.on('length', setVideoLength);
    return () => {
      statusListenerDestructor();
      videoLengthListenerDestructor();
    };
  }, [player]);

  const on = useControls('player');
  useEffect(
    () =>
      on(['playPause', 'play', 'pause', 'up', 'down'], control => {
        switch (control) {
          case 'playPause':
            player.togglePlay();
            return true;
          case 'play':
            player.play();
            return true;
          case 'pause':
            player.pause();
            return true;
          case 'up':
            if (showPlayerControls) {
              return false;
            }
            setShowPlayerControls(true);
            setTimeout(() => {
              setShowPlayerControls(false);
            }, 50000);
            return true;
          case 'down':
            if (showPlayerControls && getCurrentFocusKey() === PLAYER_PAUSE_BUTTON_FOCUS_KEY) {
              setShowPlayerControls(false);
              return true;
            }
            return false;
        }
      }),
    [on, player, showPlayerControls]
  );

  if (status === 'PAUSED' || showPlayerControls) {
    return (
      <PauseOverlay>
        <PauseIcon />
        {showPlayerControls && <PlayPauseIcon onClick={togglePlay} />}
        <PlayerProgressBarContainer>
          <PlayerProgressBar percent={(virtualPlayed / videoLength) * 100} />
          <PlayerProgressBubble percent={(virtualPlayed / videoLength) * 100} />
        </PlayerProgressBarContainer>
        <PlayedTimeContainer>
          <PlayedTime>{formatTime(virtualPlayed / 1000)}</PlayedTime>|
          <TotalTime>{formatTime(videoLength / 1000)}</TotalTime>
        </PlayedTimeContainer>
        <BrokenStreamButton
          onClick={requestNewStream}
          size={1.5}
          loading={requestingNewStreamLoading}
        >
          Video is broken
        </BrokenStreamButton>
      </PauseOverlay>
    );
  }
  return null;
};
