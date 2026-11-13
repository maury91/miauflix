import { startAudioPlayback } from '@features/player/lib/audio-playback';
import type { PlayerMedia } from '@features/player/lib/avplay-media';
import type { PlaybackStatus } from '@features/player/lib/playback-copy';
import type { CreatePlaybackSessionResponse, PlaybackDelivery } from '@miauflix/backend';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

import { type ResumePoint, resumePosition } from './usePlaybackProgress';
import type { PlaybackSource } from './usePlaybackSource';

type PlaybackSession = NonNullable<PlaybackSource['session']>;

interface AudioDeliveryOptions {
  session: PlaybackSource['session'];
  deliveryUpdate: PlaybackSource['deliveryUpdate'];
  /** The player decodes through Samsung's AVPlay, unless audio has to be converted. */
  avplay: boolean;
  videoRef: RefObject<PlayerMedia | null>;
  resume: ResumePoint;
  setStatus: (status: PlaybackStatus) => void;
  failPlayback: (message: string) => void;
  restartSession: () => void;
  settlePendingFailure: (mode: PlaybackDelivery['mode']) => void;
}

/**
 * How the audio reaches the player: the file's own tracks, or audio the backend converts and
 * streams into the `<video>` element through Media Source Extensions. Converted audio cannot
 * seek, so a seek or a track switch restarts the conversion at the new position.
 */
export function useAudioDelivery({
  session,
  deliveryUpdate,
  avplay,
  videoRef,
  resume: { resumeRef, resumeApplied, hasProgress },
  setStatus,
  failPlayback,
  restartSession,
  settlePendingFailure,
}: AudioDeliveryOptions) {
  const [audioSeek, setAudioSeek] = useState({ position: 0, autoplay: true, revision: 0 });
  const [pendingPosition, setPendingPosition] = useState<number | undefined>();
  const [audioTrackIndex, setAudioTrackIndex] = useState<number | undefined>();
  const [audioRemux, setAudioRemux] = useState(false);
  /** Converted audio is (re)starting: the element's time is not the playback position yet. */
  const audioPreparing = useRef(false);

  const selectedAudio = session?.delivery?.audioTracks?.find(
    track => track.index === audioTrackIndex
  );
  const needsSelectedTrack =
    session?.delivery?.mode === 'direct' &&
    audioTrackIndex !== session.delivery.defaultAudioTrackIndex &&
    (!(videoRef.current && 'audioTracks' in videoRef.current) ||
      selectedAudio?.canPlayDirect === false) &&
    !!selectedAudio?.mimeType;
  const audioDelivery =
    session?.delivery?.mode === 'audio-transcode' || needsSelectedTrack || audioRemux
      ? session?.delivery
      : undefined;
  // Converted audio is fed to a <video> element through Media Source Extensions
  const playsInAvplay = avplay && !audioDelivery;

  /** Converted audio restarts the conversion at the new position; anything else seeks itself. */
  const seekConvertedAudio = useCallback(
    (position: number) => {
      const autoplay = audioPreparing.current ? audioSeek.autoplay : !videoRef.current?.paused;
      resumeApplied.current = true;
      audioPreparing.current = true;
      setPendingPosition(position);
      setAudioSeek(previous => ({ position, autoplay, revision: previous.revision + 1 }));
    },
    [audioSeek.autoplay, resumeApplied, videoRef]
  );

  const seekTo = useCallback(
    (position: number) => {
      const video = videoRef.current;
      if (!video) return;
      if (audioDelivery) seekConvertedAudio(position);
      else video.currentTime = position;
    },
    [audioDelivery, seekConvertedAudio, videoRef]
  );

  /** A new session starts from the beginning, on its default track. */
  const resetForSession = useCallback((created: CreatePlaybackSessionResponse) => {
    setAudioSeek({ position: 0, autoplay: true, revision: 0 });
    setPendingPosition(undefined);
    setAudioRemux(false);
    setAudioTrackIndex(created.delivery?.defaultAudioTrackIndex);
    audioPreparing.current = created.delivery?.mode === 'audio-transcode';
  }, []);

  useEffect(() => {
    const video = videoRef.current as
      | (PlayerMedia & {
          audioTracks?: { length: number; [index: number]: { enabled: boolean } };
        })
      | null;
    if (audioDelivery || !video?.audioTracks || audioTrackIndex === undefined) return;
    // AudioTrackList is ordered like the file's audio streams, as is the delivery's track list:
    // select by position in that list rather than by the delivery's own index.
    const deliveryTracks = session?.delivery?.audioTracks;
    const position = deliveryTracks
      ? deliveryTracks.findIndex(track => track.index === audioTrackIndex)
      : audioTrackIndex;
    const select = () => {
      if (!video.audioTracks || position < 0 || !video.audioTracks[position]) return;
      for (let index = 0; index < video.audioTracks.length; index++)
        video.audioTracks[index].enabled = index === position;
    };
    select();
    video.addEventListener('loadedmetadata', select);
    return () => video.removeEventListener('loadedmetadata', select);
  }, [session, audioDelivery, audioTrackIndex, videoRef]);

  useEffect(() => {
    if (!session || !audioDelivery) return;
    let position = audioSeek.position;
    if (!resumeApplied.current && hasProgress) {
      resumeApplied.current = true;
      const saved = resumeRef.current;
      if (
        saved &&
        saved.state !== 'completed' &&
        saved.positionSeconds > 5 &&
        saved.durationSeconds > 0
      ) {
        position = resumePosition(saved, audioDelivery.durationSeconds);
      }
    }
    // Converted audio plays through Media Source Extensions, in the <video> element
    const video = videoRef.current;
    if (!(video instanceof HTMLVideoElement)) return;
    audioPreparing.current = true;
    setStatus('preparing');
    setPendingPosition(position);
    return startAudioPlayback({
      video,
      transcodeVideo: audioDelivery.transcodeVideo,
      url: session.streamUrl.endsWith('/audio') ? session.streamUrl : `${session.streamUrl}/audio`,
      mimeType:
        audioDelivery.audioTracks?.find(track => track.index === audioTrackIndex)?.mimeType ??
        audioDelivery.mimeType,
      copyAudio: audioDelivery.audioTracks?.find(track => track.index === audioTrackIndex)
        ?.copyAudio,
      durationSeconds: audioDelivery.durationSeconds,
      startSeconds: position,
      autoplay: audioSeek.autoplay,
      audioTrackIndex,
      onReady: () => {
        audioPreparing.current = false;
        setPendingPosition(undefined);
        setStatus('ready');
      },
      onError: failPlayback,
    });
  }, [
    session,
    audioDelivery,
    audioSeek,
    hasProgress,
    audioTrackIndex,
    failPlayback,
    resumeApplied,
    resumeRef,
    setStatus,
    videoRef,
  ]);

  // After the conversion above: a switch to converted audio continues from the element's time.
  useEffect(() => {
    if (!deliveryUpdate) return;
    if (deliveryUpdate.type === 'recreate') {
      restartSession();
      return;
    }
    const { delivery } = deliveryUpdate;
    setAudioTrackIndex(delivery.defaultAudioTrackIndex);
    if (delivery.mode === 'audio-transcode') {
      // Continue from where the optimistic direct stream got to.
      const video = videoRef.current;
      audioPreparing.current = true;
      settlePendingFailure(delivery.mode);
      setAudioSeek(previous => ({
        position: video?.currentTime ?? 0,
        autoplay: video ? !video.paused || video.autoplay : true,
        revision: previous.revision + 1,
      }));
    } else {
      settlePendingFailure(delivery.mode);
    }
  }, [deliveryUpdate, restartSession, settlePendingFailure, videoRef]);

  /** Switch tracks natively when the element can, else restart conversion with the new track. */
  const selectAudioTrack = (index: number) => {
    if (index === audioTrackIndex) return;
    const position = pendingPosition ?? videoRef.current?.currentTime ?? 0;
    const autoplay = audioPreparing.current ? audioSeek.autoplay : !videoRef.current?.paused;
    resumeApplied.current = true;
    const nativeSelection =
      session?.delivery?.mode === 'direct' &&
      !audioRemux &&
      videoRef.current &&
      'audioTracks' in videoRef.current &&
      session.delivery.audioTracks?.find(track => track.index === index)?.canPlayDirect !== false;
    audioPreparing.current = !nativeSelection;
    if (!nativeSelection) {
      setAudioRemux(true);
      setPendingPosition(position);
    }
    setAudioTrackIndex(index);
    setAudioSeek(previous => ({ position, autoplay, revision: previous.revision + 1 }));
  };

  return {
    audioSeek,
    audioTrackIndex,
    pendingPosition,
    audioPreparing,
    /** The delivery while audio is converted, else undefined. */
    audioDelivery,
    playsInAvplay,
    /** The tracks this player can switch to. */
    audioTracks: listedAudioTracks(session, videoRef.current),
    selectAudioTrack,
    seekConvertedAudio,
    seekTo,
    resetForSession,
  };
}

function listedAudioTracks(session: PlaybackSession | null, media: PlayerMedia | null) {
  return session?.delivery?.audioTracks?.filter(
    track =>
      session.delivery?.mode === 'audio-transcode' ||
      track.index === session.delivery?.defaultAudioTrackIndex ||
      !!track.mimeType ||
      (media && 'audioTracks' in media && track.canPlayDirect)
  );
}
