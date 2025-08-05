import { useEffect, useMemo, useState } from 'react';

import { IS_TIZEN } from '@/consts';

import { TizenPlayer } from '../platforms/tizen';
import { WebPlayer } from '../platforms/web';
import type { Player, Track } from '../playerClassAbstract';

const getPlayer = (): Player => {
  if (IS_TIZEN) {
    return new TizenPlayer();
  }
  return new WebPlayer();
};

interface UsePlayerArgs {
  initialPosition: number;
  streamUrl: string;
  audioLanguage?: string;
  subtitleLanguage?: string;
  subtitleEnabled?: boolean;
}

export const usePlayer = ({
  initialPosition,
  streamUrl,
  audioLanguage = 'en',
  subtitleEnabled = true,
  subtitleLanguage = 'en',
}: UsePlayerArgs) => {
  const player = useMemo(() => getPlayer(), []);

  const [audioTracks, setAudioTracks] = useState<Track[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<Track[]>([]);

  useEffect(() => {
    return player.on('ready', () => {
      setAudioTracks(player.getAudioTracks());
      setSubtitleTracks(player.getSubtitleTracks());
      if (subtitleEnabled) {
        player.enableSubtitle();
      } else {
        player.disableSubtitle();
      }
      player.play();
    });
  }, [player, subtitleEnabled]);

  useEffect(() => {
    const audioTrack = audioTracks.find(track => track.language === audioLanguage);
    if (audioTrack) {
      player.setAudioTrack(audioTrack);
    }
  }, [audioLanguage, audioTracks, player]);

  useEffect(() => {
    const subtitleTrack = subtitleTracks.find(track => track.language === subtitleLanguage);
    if (subtitleTrack) {
      player.setSubtitleTrack(subtitleTrack);
    }
  }, [player, subtitleLanguage, subtitleTracks]);

  useEffect(() => {
    if (player.isReady()) {
      if (subtitleEnabled) {
        player.enableSubtitle();
      } else {
        player.disableSubtitle();
      }
    }
  }, [player, subtitleEnabled]);

  useEffect(() => {
    return player.on('ready', () => {
      if (initialPosition) {
        // ToDo: use absolute time instead of percentage
        player.seekTo(player.videoLength() * (initialPosition / 100));
      }
    });
  }, [initialPosition, player]);

  useEffect(() => {
    if (streamUrl) {
      player.init(streamUrl).catch(err => {
        // ToDo: better handling: show the error in the screen, maybe add a button to try again
        console.error('Failed to open video', err);
      });
    }
  }, [streamUrl, player]);

  return player;
};
