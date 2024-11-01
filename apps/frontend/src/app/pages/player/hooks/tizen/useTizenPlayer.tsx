import { useCallback, useEffect, useState } from 'react';
import { IS_TIZEN } from '../../../../../consts';

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

interface UseTizenPlayerArgs {
  streamUrl: string;
}

export const useTizenPlayer = ({ streamUrl }: UseTizenPlayerArgs) => {
  const [played, setPlayed] = useState(0);
  const [videoLength, setVideoLength] = useState(0);
  const [playerStatus, setPlayerStatus] = useState<
    'PLAYING' | 'READY' | 'IDLE' | 'PAUSED'
  >('IDLE');

  const pause = useCallback(() => {
    if (getPlayerStatus() !== 'IDLE') {
      window.webapis.avplay.pause();
      setPlayerStatus('PAUSED');
    }
  }, []);

  const play = useCallback(() => {
    if (getPlayerStatus() !== 'IDLE') {
      playVideo();
      setPlayerStatus('PLAYING');
    }
  }, []);

  const togglePlay = useCallback(() => {
    const status = getPlayerStatus();
    if (status === 'PLAYING') {
      pause();
    }
    if (status === 'PAUSED') {
      play();
    }
  }, [pause, play]);

  const seekTo = useCallback((position: number) => {
    window.webapis.avplay.seekTo(position);
    setPlayed(position);
  }, []);

  const closePlayer = useCallback(() => {
    window.webapis.avplay.close();
  }, []);

  useEffect(() => {
    if (streamUrl && IS_TIZEN) {
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
        // onbufferingprogress: function (percent) {
        //   setBuffered(percent);
        // },
        onbufferingcomplete: function () {
          console.log('Buffering complete.');
        },
        oncurrentplaytime: function (currentTime) {
          setPlayed(currentTime);
        },
      });
    }
  }, [streamUrl]);

  return {
    played,
    videoLength,
    playerStatus,
    pause,
    play,
    seekTo,
    togglePlay,
    closePlayer,
  };
};
