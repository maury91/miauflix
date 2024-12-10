import { FC, useEffect, useState } from 'react';
import { usePlayerContext } from '../context';
import { PlayerStatus } from '../hooks/playerClassAbstract';
import { useVirtualSeek } from '../hooks/useVirtualSeek';
import { useTizenRemote } from '../hooks/tizen/useTizenRemote';
import {
  OverlayPlayIcon,
  PauseIcon,
  PauseOverlay,
  PlayedTime,
  PlayedTimeContainer,
  PlayerProgressBar,
  PlayerProgressBarContainer,
  PlayerProgressBubble,
  TotalTime,
} from '../ui/common';

const formatTime = (time: number) => {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor(time / 60) % 60;
  const seconds = Math.floor(time % 60);

  const parts = hours ? [hours, minutes, seconds] : [minutes, seconds];
  return parts.map((part) => part.toString().padStart(2, '0')).join(':');
};

// ToDo: Implement downloaded bar
export const PlayerInterface: FC = () => {
  const player = usePlayerContext();
  const [showPlayerControls, setShowPlayerControls] = useState(false);
  const [status, setStatus] = useState<PlayerStatus>('NONE');
  const [videoLength, setVideoLength] = useState(0);
  const virtualPlayed = useVirtualSeek(player);

  useEffect(() => {
    const statusListenerDestructor = player.on('status', setStatus);
    const videoLengthListenerDestructor = player.on('length', setVideoLength);
    return () => {
      statusListenerDestructor();
      videoLengthListenerDestructor();
    };
  }, [player]);

  const setRemoteListener = useTizenRemote();
  setRemoteListener('MediaPlayPause', player.togglePlay);
  setRemoteListener('MediaPlay', player.play);
  setRemoteListener('MediaPause', player.pause);
  setRemoteListener('ArrowUp', () => {
    setShowPlayerControls(true);
    setTimeout(() => {
      setShowPlayerControls(false);
    }, 5000);
  });
  setRemoteListener('ArrowDown', () => {
    setShowPlayerControls(false);
  });

  if (status === 'PAUSED' || showPlayerControls) {
    return (
      <PauseOverlay>
        <PauseIcon />
        {status === 'PAUSED' && <OverlayPlayIcon />}
        <PlayerProgressBarContainer>
          <PlayerProgressBar percent={(virtualPlayed / videoLength) * 100} />
          <PlayerProgressBubble percent={(virtualPlayed / videoLength) * 100} />
        </PlayerProgressBarContainer>
        <PlayedTimeContainer>
          <PlayedTime>{formatTime(virtualPlayed / 1000)}</PlayedTime>|
          <TotalTime>{formatTime(videoLength / 1000)}</TotalTime>
        </PlayedTimeContainer>
      </PauseOverlay>
    );
  }
  return null;
};
