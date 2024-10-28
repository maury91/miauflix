import { useCallback, useEffect, useState } from 'react';
import OcticonPlay16 from '~icons/octicon/play-16';
import MdiPaw from '~icons/mdi/paw';
import { useAppSelector } from '../../../store/store';
import { IS_TIZEN, PALETTE } from '../../../consts';
import styled from 'styled-components';
import { TVInputDeviceKeyName } from '../../../tizen';
import LineMdPlayFilled from '~icons/line-md/play-filled';
import { colors } from '../welcome/consts';

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

const TizenPlayerContainer = styled.object`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10000;
`;

const PauseOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
`;

const PauseIcon = styled(OcticonPlay16)`
  font-size: 10vh;
  color: #aaa;
`;

const PlayerProgressBarContainer = styled.div`
  position: absolute;
  left: 8vw;
  right: 8vw;
  background: #aaa;
  height: 0.5vh;
  bottom: 8vh;
`;
const OverlayPlayIcon = styled(LineMdPlayFilled)`
  position: absolute;
  left: 3vw;
  bottom: 4vh;
  font-size: 4vh;
  color: #aaa;
  transform: translate(0, -50%);
`;

const PlayerProgressBar = styled.div<{ percent: number }>`
  position: absolute;
  left: 0;
  top: 0;
  width: ${({ percent }) => percent}%;
  height: 100%;
  background: ${PALETTE.background.primary};
`;

const PlayerProgressBubble = styled(MdiPaw)<{ percent: number }>`
  position: absolute;
  left: ${({ percent }) => percent}%;
  top: 50%;
  font-size: 3.5vh;
  color: ${PALETTE.background.primary};
  transform: translate(-50%, -63%);
`;

const PlayedTimeContainer = styled.div`
  position: absolute;
  left: 8vw;
  bottom: 2vh;
  font-size: 2.5vh;
  color: ${PALETTE.text.primary};
  font-family: 'Poppins', sans-serif;
  font-weight: 400;
`;

const PlayedTime = styled.span`
  color: ${PALETTE.background.primary};
  margin-right: 0.5em;
`;
const TotalTime = styled.span`
  color: ${PALETTE.background.disabled};
  margin-left: 0.5em;
`;

const autoSelectAudioTrack = () => {
  const tracks = window.webapis.avplay.getTotalTrackInfo();
  const audioTracks = tracks.filter((track) => track.type === 'AUDIO');
  if (audioTracks.length > 1) {
    const englishTrack = audioTracks.find(({ extra_info }) =>
      extra_info.match(/lang[^:]*:[^:]*en/)
    );
    if (englishTrack) {
      window.webapis.avplay.setSelectTrack('AUDIO', englishTrack.index);
    }
  }
};

const openVideo = (url: string): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    window.webapis.avplay.open(url);
    window.webapis.avplay.setDisplayRect(
      0,
      0,
      window.innerWidth,
      window.innerHeight
    );
    window.webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
    window.webapis.avplay.prepareAsync(resolve, reject);
  }).then(autoSelectAudioTrack);
};

const playVideo = () => {
  window.webapis.avplay.play();
};

const getPlayerStatus = () => {
  return window.webapis.avplay.getState();
};

const formatTime = (time: number) => {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor(time / 60) % 60;
  const seconds = Math.floor(time % 60);

  const parts = hours ? [hours, minutes, seconds] : [minutes, seconds];
  return parts.map((part) => part.toString().padStart(2, '0')).join(':');
};

const useTizenRemote = () => {
  const mappedKeys = new Map<TVInputDeviceKeyName, () => void>();
  useEffect(() => {
    if (!IS_TIZEN) {
      return;
    }
    function keyboardListener(event: KeyboardEvent) {
      if (event.keyCode in window.INVERTED_REMOTE_KEY_MAP) {
        const keyName = window.INVERTED_REMOTE_KEY_MAP[event.keyCode];
        mappedKeys.get(keyName)?.();
      }
    }

    document.body.addEventListener('keydown', keyboardListener);
    return () => {
      document.body.removeEventListener('keydown', keyboardListener);
    };
  }, [mappedKeys]);
  return useCallback(
    (key: TVInputDeviceKeyName, cb: () => void) => {
      mappedKeys.set(key, cb);
    },
    [mappedKeys]
  );
};

export const Player = () => {
  const streamUrl = useAppSelector((state) => state.stream.url);
  const [playerStatus, setPlayerStatus] = useState<
    'PLAYING' | 'READY' | 'IDLE' | 'PAUSED'
  >('IDLE');
  const [buffered, setBuffered] = useState(0);
  const [played, setPlayed] = useState(0);
  const [videoLength, setVideoLength] = useState(0);

  const addRemoteListener = useTizenRemote();
  addRemoteListener('MediaPlayPause', () => {
    const status = getPlayerStatus();
    if (status === 'PLAYING') {
      window.webapis.avplay.pause();
      setPlayerStatus('PAUSED');
    } else if (status === 'PAUSED') {
      playVideo();
      setPlayerStatus('PLAYING');
    }
  });
  addRemoteListener('MediaPlay', () => {
    if (getPlayerStatus() !== 'IDLE') {
      playVideo();
      setPlayerStatus('PLAYING');
    }
  });
  addRemoteListener('MediaPause', () => {
    if (getPlayerStatus() !== 'IDLE') {
      window.webapis.avplay.pause();
      setPlayerStatus('PAUSED');
    }
  });

  useEffect(() => {
    if (streamUrl) {
      // Create player
      if (IS_TIZEN) {
        openVideo(streamUrl)
          .then(() => {
            playVideo();
            setVideoLength(window.webapis.avplay.getDuration());
          })
          .catch((err) => {
            console.error('Failed to open video', err);
          });
        window.webapis.avplay.setListener({
          onbufferingstart: function () {
            setPlayerStatus((prevStatus) => {
              if (prevStatus === 'IDLE') {
                return 'READY';
              }
              return prevStatus;
            });
          },
          onbufferingprogress: function (percent) {
            setBuffered(percent);
          },
          onbufferingcomplete: function () {
            console.log('Buffering complete.');
          },
          oncurrentplaytime: function (currentTime) {
            setPlayed(currentTime);
          },
        });
      }
    }
  }, [streamUrl]);

  if (IS_TIZEN) {
    return (
      <>
        <TizenPlayerContainer type={'application/avplayer'} />
        {playerStatus === 'PAUSED' && (
          <PauseOverlay>
            <PauseIcon />
            {playerStatus === 'PAUSED' && <OverlayPlayIcon />}
            <PlayerProgressBarContainer>
              <PlayerProgressBar percent={(played / videoLength) * 100} />
              <PlayerProgressBubble percent={(played / videoLength) * 100} />
            </PlayerProgressBarContainer>
            <PlayedTimeContainer>
              <PlayedTime>{formatTime(played / 1000)}</PlayedTime>|
              <TotalTime>{formatTime(videoLength / 1000)}</TotalTime>
            </PlayedTimeContainer>
          </PauseOverlay>
        )}
      </>
    );
  }

  return null;
};
