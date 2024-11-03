import { useCallback, useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../store/store';
import { IS_TIZEN } from '../../../consts';
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
} from './ui/common';
import { TizenPlayerContainer } from './ui/tizen';
import { useTizenRemote } from './hooks/tizen/useTizenRemote';
import { useTizenPlayer } from './hooks/tizen/useTizenPlayer';
import { useBackNavigation } from '../../hooks/useBackNavigation';
import { navigateTo } from '../../../store/slices/app';
import { useTrackMovieProgressMutation } from '../../../store/api/progress';
import { TrackMoviePlaybackRequest } from '@miauflix/types';
import styled from 'styled-components';
import { setMediaProgress } from '../../../store/slices/resume';

/*
window.webapis.avplay.setListener({
  onbufferingstart: function() {
    console.log("Buffering start.");
  },
  onbufferingprogress: function(percent) {
    console.log("Buffering progress data : " + percent);
  },
  onbufferingcomplete: function() {
    console.log("Buffering complete.");
  },
  oncurrentplaytime: function(currentTime) {
    console.log("Current Playtime : " + currentTime);
  },
  onbufferingcomplete: function() {
    console.log("Buffering complete.");
  },
  onevent: function(eventType, eventData) {
    console.log("event type error : " + eventType + ", data: " + eventData);
  },
  onerror: function(eventType) {
    console.log("event type error : " + eventType);
  },
  onerrormsg: function(eventType,eventMsg) {
    console.log("event type error : " + eventType);
    console.log("event Message : " + eventMsg);
  },
  onsubtitlechange: function(duration, text, data3, data4) {
    console.log("Subtitle Changed.");
  },
  ondrmevent: function(drmEvent, drmData) {
    console.log("DRM callback: " + drmEvent + ", data: " + drmData);
  },
  onstreamcompleted: function() {
    console.log("Stream Completed");
  }
})
*/

const SubtitleDisplay = styled.p<{ index: number }>`
  position: fixed;
  text-align: center;
  font-size: 3vh;
  color: white;
  background: rgba(0, 0, 0, 0.3);
  bottom: ${({ index }) => 10 - index * 4}vh;
  z-index: 10002;
  left: 50%;
  transform: translateX(-50%);
`;

const formatTime = (time: number) => {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor(time / 60) % 60;
  const seconds = Math.floor(time % 60);

  const parts = hours ? [hours, minutes, seconds] : [minutes, seconds];
  return parts.map((part) => part.toString().padStart(2, '0')).join(':');
};

function calculatePosition(
  startingPosition: number,
  currentPosition: number,
  videoLength: number,
  action: 'FF' | 'REW' | null,
  actionMultiplier: number
) {
  if (action === 'FF') {
    return Math.min(
      startingPosition + actionMultiplier * 10000,
      videoLength - 10000
    );
  }
  if (action === 'REW') {
    return Math.max(startingPosition - actionMultiplier * 10000, 0);
  }
  return currentPosition;
}

export const Player = () => {
  const dispatch = useAppDispatch();
  const [updateMovieProgress] = useTrackMovieProgressMutation();
  const userId = useAppSelector((state) => state.app.currentUserId);
  const streamUrl = useAppSelector((state) => state.stream.url);
  const mediaId = useAppSelector((state) => state.stream.id);
  const mediaType = useAppSelector((state) => state.stream.type);
  const initialPosition = useAppSelector(
    (state) => state.resume.mediaProgress[mediaId] ?? 0
  );
  const [showPlayerControls, setShowPlayerControls] = useState(false);
  const [lastSeekTo, setLastSeekTo] = useState(0);
  // const [buffered, setBuffered] = useState(0);
  const [playedAtActionBegin, setPlayedAtActionBegin] = useState(0);
  const [action, setAction] = useState<'FF' | 'REW' | null>(null);
  const [actionMultiplier, setActionMultiplier] = useState(0);
  const {
    playerStatus,
    pause,
    play,
    videoLength,
    seekTo,
    played,
    togglePlay,
    closePlayer,
    subtitle,
  } = useTizenPlayer({ initialPosition, streamUrl });

  const updateProgress = useCallback(
    (args: TrackMoviePlaybackRequest) => {
      if (mediaType === 'movie') {
        updateMovieProgress({
          id: mediaId,
          userId,
          ...args,
        });
        dispatch(setMediaProgress({ mediaId, progress: args.progress }));
      }
    },
    [dispatch, mediaId, mediaType, updateMovieProgress, userId]
  );

  const close = useCallback(() => {
    closePlayer();
    updateProgress({ action: 'stop', progress: (played / videoLength) * 100 });
  }, [closePlayer, played, videoLength, updateProgress]);

  useEffect(() => {
    if (playerStatus === 'PLAYING') {
      updateProgress({
        action: 'start',
        progress: (played / videoLength) * 100,
      });
    }
    if (playerStatus === 'PAUSED') {
      updateProgress({
        action: 'pause',
        progress: (played / videoLength) * 100,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerStatus, updateProgress]);

  const virtualPlayed = calculatePosition(
    playedAtActionBegin,
    played,
    videoLength,
    action,
    actionMultiplier
  );

  const onActionStart = useCallback(
    (type: 'FF' | 'REW') => {
      setAction(type);
      setActionMultiplier(0);
      setPlayedAtActionBegin(virtualPlayed);
      pause();
    },
    [pause, virtualPlayed]
  );

  const onActionEnd = useCallback(() => {
    setAction(null);
    play();
    if (actionMultiplier === 0) {
      seekTo(calculatePosition(playedAtActionBegin, 0, videoLength, action, 1));
    } else {
      seekTo(virtualPlayed);
      setActionMultiplier(0);
    }
  }, [
    action,
    actionMultiplier,
    play,
    playedAtActionBegin,
    seekTo,
    videoLength,
    virtualPlayed,
  ]);

  const navigateBack = useCallback(() => {
    dispatch(navigateTo('home'));
    close();
  }, [close, dispatch]);

  const addRemoteListener = useTizenRemote();
  addRemoteListener('MediaPlayPause', togglePlay);
  addRemoteListener('MediaPlay', play);
  addRemoteListener('MediaPause', pause);
  addRemoteListener(
    'ArrowRight',
    (type) => {
      if (type === 'down') {
        if (action !== 'FF') {
          onActionStart('FF');
        }
      } else {
        onActionEnd();
      }
    },
    true
  );
  addRemoteListener(
    'ArrowLeft',
    (type) => {
      if (type === 'down') {
        if (action !== 'REW') {
          onActionStart('REW');
        }
      } else {
        onActionEnd();
      }
    },
    true
  );
  addRemoteListener('ArrowUp', () => {
    setShowPlayerControls(true);
    setTimeout(() => {
      setShowPlayerControls(false);
    }, 5000);
  });
  addRemoteListener('ArrowDown', () => {
    setShowPlayerControls(false);
  });
  useBackNavigation('player', navigateBack);

  useEffect(() => {
    if (action === 'FF' || action === 'REW') {
      const handle = setInterval(() => {
        setActionMultiplier((prev) => {
          return prev + Math.ceil(Math.log10(prev + 1)) + 1;
        });
      }, 100);
      return () => {
        clearTimeout(handle);
      };
    }
    return;
  }, [action]);

  // Seeking often has bad effect on the tv
  useEffect(() => {
    if (lastSeekTo < Date.now() - 2000) {
      if (action === 'FF' || action === 'REW') {
        seekTo(virtualPlayed);
        setLastSeekTo(Date.now());
      }
    }
  }, [lastSeekTo, action, virtualPlayed, seekTo]);

  useEffect(() => {
    if (played > 0 && played >= videoLength - 500) {
      navigateBack();
    }
  }, [navigateBack, played, videoLength]);

  return (
    <>
      {IS_TIZEN && <TizenPlayerContainer type={'application/avplayer'} />}
      {(playerStatus === 'PAUSED' || showPlayerControls) && (
        <PauseOverlay>
          <PauseIcon />
          {playerStatus === 'PAUSED' && <OverlayPlayIcon />}
          <PlayerProgressBarContainer>
            <PlayerProgressBar percent={(virtualPlayed / videoLength) * 100} />
            <PlayerProgressBubble
              percent={(virtualPlayed / videoLength) * 100}
            />
          </PlayerProgressBarContainer>
          <PlayedTimeContainer>
            <PlayedTime>{formatTime(virtualPlayed / 1000)}</PlayedTime>|
            <TotalTime>{formatTime(videoLength / 1000)}</TotalTime>
          </PlayedTimeContainer>
        </PauseOverlay>
      )}
      {subtitle.length > 0 &&
        subtitle.split('<br>').map((line, index, arr) => (
          <SubtitleDisplay
            key={index}
            index={index - Math.max(arr.length - 2, 0)}
          >
            {line}
          </SubtitleDisplay>
        ))}
    </>
  );
};
