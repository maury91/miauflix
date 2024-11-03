import { useCallback, useEffect, useState } from 'react';
import { IS_TIZEN } from '../../../../../consts';

const autoSelectAudioTrack = () => {
  console.log('Getting tracks');
  const tracks = window.webapis.avplay.getTotalTrackInfo();
  const audioTracks = tracks.filter((track) => track.type === 'AUDIO');
  console.log('Audio tracks', audioTracks);
  console.log(window.webapis.avplay.getState());
  if (audioTracks.length > 1) {
    console.log('Choosing english track');
    const englishTrack = audioTracks.find(({ extra_info }) =>
      extra_info.match(/lang[^:]*:[^:]*en/)
    );
    if (englishTrack) {
      try {
        window.webapis.avplay.setSelectTrack('AUDIO', englishTrack.index);
      } catch (err) {
        console.error('Could not change audio track');
      }
    }
  }
};

const autoSelectSubtitleTrack = () => {
  const tracks = window.webapis.avplay.getTotalTrackInfo();
  const textTracks = tracks.filter((track) => track.type === 'TEXT');
  if (textTracks.length >= 1) {
    const englishTrack = textTracks.find(({ extra_info }) =>
      extra_info.match(/lang[^:]*:[^:]*en/)
    );
    if (englishTrack) {
      try {
        window.webapis.avplay.setSelectTrack('TEXT', englishTrack.index);
      } catch (err) {
        console.error('Could not change subtitle track');
      }
    }
  }
};

const openVideo = (url: string): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    console.log('Opening video', url);
    console.log(window.webapis.avplay.open(url));
    console.log('Setting display rect');
    console.log(
      window.webapis.avplay.setDisplayRect(
        0,
        0,
        window.innerWidth,
        window.innerHeight
      )
    );
    console.log('Setting display method');
    console.log(
      window.webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX')
    );
    console.log('Preparing');
    console.log(window.webapis.avplay.prepareAsync(resolve, reject));
  });
};

const playVideo = () => {
  console.log('Playing...');
  window.webapis.avplay.play();
};

const getPlayerStatus = () => {
  return window.webapis.avplay.getState();
};

interface UseTizenPlayerArgs {
  initialPosition: number;
  streamUrl: string;
}

export const useTizenPlayer = ({
  initialPosition,
  streamUrl,
}: UseTizenPlayerArgs) => {
  const [played, setPlayed] = useState(0);
  const [subtitle, setSubtitle] = useState('');
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
          console.log('Getting and setting video length');
          const videoDuration = window.webapis.avplay.getDuration();
          setVideoLength(videoDuration);
          console.log('Selecting audio');
          autoSelectAudioTrack();
          console.log('Selecting subtitles');
          autoSelectSubtitleTrack();
          seekTo(videoDuration * (initialPosition / 100));
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
        onsubtitlechange: function (_duration, text) {
          setSubtitle(text);
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
    subtitle,
  };
};
