import { useRequestAvailabilityMutation } from '@features/notifications/api/notifications.api';
import { useAudioDelivery } from '@features/player/hooks/useAudioDelivery';
import {
  resumePosition,
  usePlaybackProgress,
  useResumePoint,
} from '@features/player/hooks/usePlaybackProgress';
import { type NextEpisode, usePlaybackPrompts } from '@features/player/hooks/usePlaybackPrompts';
import { usePlaybackSource } from '@features/player/hooks/usePlaybackSource';
import { useSubtitles } from '@features/player/hooks/useSubtitles';
import { getAvplay, type PlayerMedia } from '@features/player/lib/avplay-media';
import { mediaSubtitleKey } from '@features/player/lib/media-subtitles';
import type { PlayableRef } from '@miauflix/backend';
import { builtForTizen, PALETTE } from '@shared/config/constants';
import { Button } from '@shared/design-system';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { FocusScope, NavigationProvider, useNavigation } from '@shared/navigation';
import { selectCurrentUser } from '@store/slices/auth';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';

import {
  getNoSourceMessage,
  getPlaybackStatusMessage,
  getSourceAttemptMessage,
  getStreamStageMessage,
} from '../lib/playback-copy';
import { AvplayVideo, type PlayerMediaEvents } from './AvplayVideo';
import { PlayerControls, PlayerHeader, PlayerPrompt } from './PlayerControls';
import { SubtitleCaption } from './SubtitleCaption';

import BellIcon from '~icons/mdi/bell-ring-outline';

const Page = styled.main`
  position: absolute;
  inset: 0;
  z-index: 4;
  display: grid;
  place-items: center;
  background: #000;
  outline: none;
`;

/** How long a held picture waits for AVPlay to play before it goes anyway. */
const PICTURE_HOLD_LIMIT_MS = 15_000;

const Video = styled.video<{ $held?: boolean }>`
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
  ${({ $held }) =>
    $held &&
    `
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1;
  `}
`;

const Message = styled.div`
  display: grid;
  gap: 16px;
  width: min(90vw, 576px);
  color: ${PALETTE.text.primary};
  text-align: center;
`;

const Title = styled.h1`
  margin: 0;
  color: ${PALETTE.text.primary};
  font-size: clamp(22.4px, 3vw, 35.2px);
`;

const VideoStatus = styled.p<{ $ready: boolean }>`
  position: fixed;
  right: 16px;
  top: 80px;
  left: 16px;
  z-index: 1;
  margin: 0 auto;
  color: ${PALETTE.text.secondary};
  text-align: center;
  pointer-events: none;
  ${({ $ready }) =>
    $ready &&
    `
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  `}
`;

interface PlayerViewProps {
  playable: PlayableRef;
  title: string;
  onBack: () => void;
  nextEpisode: NextEpisode | null;
  onPlayNext: () => void;
}

const NAV = { scope: 'player', retry: 'player-retry', notify: 'player-notify' } as const;

/**
 * Play a target: create its playback session (walking its sources on failure, with a retry),
 * deliver its audio, report and resume progress, draw subtitles, and offer intro/credits skips
 * and the next episode. Each concern lives in a hook under `features/player/hooks`. The player is
 * one navigation scope on the design system.
 */
export function PlayerView(props: PlayerViewProps) {
  return (
    <NavigationProvider>
      <PlayerScreen {...props} />
    </NavigationProvider>
  );
}

function PlayerScreen({ playable, title, onBack, nextEpisode, onPlayNext }: PlayerViewProps) {
  const currentUser = useSelector(selectCurrentUser);
  /** Samsung TVs play through AVPlay, which decodes far more than their browser does. */
  const [avplay] = useState(() => (builtForTizen ? getAvplay() : undefined));
  const videoRef = useRef<PlayerMedia | null>(null);
  /** The same element as `videoRef`, for effects that attach to it (the ASS renderer). */
  const [mediaElement, setMediaElement] = useState<PlayerMedia | null>(null);
  const setMedia = useCallback((media: PlayerMedia | null) => {
    videoRef.current = media;
    setMediaElement(media);
  }, []);
  /** The `<video>` element, which can stay on screen (paused) after AVPlay took over. */
  const videoElement = useRef<HTMLVideoElement | null>(null);
  const setVideoElement = useCallback(
    (element: HTMLVideoElement | null) => {
      if (element) {
        videoElement.current = element;
        setMedia(element);
        return;
      }
      const detached = videoElement.current;
      // A held picture going away must not drop the player that replaced it.
      if (videoRef.current === detached) setMedia(null);
      videoElement.current = null;
      // A held picture kept its converted stream attached: let the decoder go. The ref also
      // detaches while a Suspense boundary hides the player, with the element kept and its stream
      // playing on: only an element the commit removed from the page is emptied.
      queueMicrotask(() => {
        if (detached?.isConnected || !detached?.getAttribute('src')?.startsWith('blob:')) return;
        detached.removeAttribute('src');
        detached.load();
      });
    },
    [setMedia]
  );
  const subtitleStorageKey = mediaSubtitleKey(currentUser?.id, playable);

  // Call order matters: each hook's effects run in this order, and later ones rely on it
  // (the session request resets resume state before the direct stream resumes, and converted
  // audio starts before a delivery update reads the element's position).
  const source = usePlaybackSource({
    playable,
    title,
    avplay: !!avplay,
    subtitleKey: subtitleStorageKey,
  });
  const { session, status, error } = source;
  const [requestAvailability, availabilityRequest] = useRequestAvailabilityMutation();
  const resume = useResumePoint(playable);
  const audio = useAudioDelivery({
    session,
    deliveryUpdate: source.deliveryUpdate,
    avplay: !!avplay,
    videoRef,
    resume,
    setStatus: source.setStatus,
    failPlayback: source.failPlayback,
    restartSession: source.restartSession,
    pictureHeld: source.pictureHeld,
    settlePendingFailure: source.settlePendingFailure,
  });
  const { audioDelivery, audioPreparing, playsInAvplay } = audio;
  const progress = usePlaybackProgress({
    playable,
    videoRef,
    audioPreparing,
    delivery: session?.delivery,
    audioDelivery,
    resume,
  });
  source.handlers.current = {
    onRequestStart: progress.resetForRequest,
    onSessionCreated: audio.resetForSession,
    onTargetLeave: progress.captureLeave,
  };
  const subtitles = useSubtitles({
    session,
    storageKey: subtitleStorageKey,
    sessionStorageKey: source.sessionSubtitleKey,
    sessionKeyVersion: source.subtitleKeyVersion,
    videoRef,
    mediaElement,
    resumeRef: resume.resumeRef,
    playsInAvplay,
    audioSeek: audio.audioSeek,
    audioTrackIndex: audio.audioTrackIndex,
  });
  const prompts = usePlaybackPrompts({
    playable,
    nextEpisode,
    session,
    avplay: !!avplay,
    videoRef,
    seekTo: audio.seekTo,
    completeOnce: progress.completeOnce,
    onPlayNext,
  });

  // A switch from converted audio to AVPlay: the paused <video> keeps its last frame on top while
  // AVPlay prepares underneath from the same position. AVPlay's picture replaces it once it plays.
  const { pictureHeld, releasePicture } = source;
  const holdingPicture = pictureHeld && source.replacementReady && !!avplay && playsInAvplay;
  /** The player a held picture's position was handed to, once. */
  const handedOverTo = useRef<PlayerMedia | null>(null);
  useEffect(() => {
    if (!pictureHeld) return;
    // The new session plays in the <video> again: nothing to hand over.
    if (source.replacementReady && !(avplay && playsInAvplay)) {
      releasePicture();
      return;
    }
    const media = mediaElement;
    if (!holdingPicture || !media || media === videoElement.current) return;
    if (handedOverTo.current !== media) {
      handedOverTo.current = media;
      resume.resumeApplied.current = true;
      media.currentTime = videoElement.current?.currentTime ?? media.currentTime;
    }
    media.addEventListener('playing', releasePicture);
    media.addEventListener('error', releasePicture);
    // Paused, the held picture stays until the viewer plays: AVPlay shows nothing before.
    const timer = media.autoplay ? window.setTimeout(releasePicture, PICTURE_HOLD_LIMIT_MS) : 0;
    return () => {
      media.removeEventListener('playing', releasePicture);
      media.removeEventListener('error', releasePicture);
      window.clearTimeout(timer);
    };
  }, [
    avplay,
    holdingPicture,
    mediaElement,
    pictureHeld,
    playsInAvplay,
    releasePicture,
    resume.resumeApplied,
    source.replacementReady,
  ]);

  // AVPlay opens a TV version still being built from near its newest segment: its playlist is
  // asked to start where playback will (the held picture, else the resume point), once per stream,
  // so it waits for the saved progress (null until then).
  const avplayStart = useRef<{
    streamUrl: string;
    src: string;
    start: number;
    autoplay: boolean;
  } | null>(null);
  const avplayOpen = (() => {
    if (!session || session.delivery?.mode !== 'remux')
      return { src: session?.streamUrl ?? '', start: undefined, autoplay: true };
    if (avplayStart.current?.streamUrl === session.streamUrl) return avplayStart.current;
    const holding = pictureHeld && !!videoElement.current;
    if (!holding && !resume.progressSettled) return null;
    const saved = resume.resumeRef.current;
    const duration = session.delivery.durationSeconds;
    const start =
      holding && videoElement.current
        ? videoElement.current.currentTime
        : saved && saved.state !== 'completed' && saved.positionSeconds > 5 && duration > 0
          ? resumePosition(saved, duration)
          : 0;
    const src = `${session.streamUrl}?start=${Math.floor(start)}`;
    // A viewer who paused before the handoff finds it paused after.
    const autoplay = !(holding && videoElement.current?.paused);
    avplayStart.current = { streamUrl: session.streamUrl, src, start, autoplay };
    return avplayStart.current;
  })();

  useEffect(() => {
    document.body.dataset['miauflixPlayer'] = 'true';
    return () => {
      delete document.body.dataset['miauflixPlayer'];
    };
  }, []);

  const mediaEvents: Required<PlayerMediaEvents> = {
    onLoadedMetadata: (event: { currentTarget: PlayerMedia }) => {
      progress.handleLoadedMetadata(event.currentTarget);
    },
    onSeeked: (event: { currentTarget: PlayerMedia }) => {
      if (audioPreparing.current) return;
      prompts.handleSeeked(event.currentTarget.currentTime);
      subtitles.followPlayhead(event.currentTarget.currentTime);
      prompts.updatePrompts();
    },
    onTimeUpdate: (event: { currentTarget: PlayerMedia }) => {
      if (audioPreparing.current) return;
      prompts.handleTimeUpdate(event.currentTarget);
      subtitles.followPlayhead(event.currentTarget.currentTime);
      progress.readProgressSnapshot();
      prompts.updatePrompts();
    },
    onCanPlay: () => {
      if (!audioPreparing.current) source.setStatus('ready');
    },
    onPlaying: () => {
      if (!audioPreparing.current) {
        source.setStatus('ready');
        progress.handlePlaying();
      }
    },
    onPause: () => progress.handlePause(),
    onEnded: () => {
      progress.handleEnded();
      prompts.updateNextCountdown();
    },
    onError: () => source.handleMediaError(),
  };

  const navigation = useNavigation();
  // Back leaves the player, after whatever is open inside it (the subtitle panel) took it. An
  // element scope, so it wins over page-wide handlers of the screens underneath.
  const pageRef = useKeyboardNavigation({
    onBack: () => {
      onBack();
      return true;
    },
  });
  // A failure's action takes the focus, in the commit that shows it
  const notifyShown = status === 'exhausted' && !availabilityRequest.isSuccess;
  useLayoutEffect(() => {
    if (error) navigation.focus(NAV.retry);
    else if (notifyShown) navigation.focus(NAV.notify);
    // The store's focus is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, notifyShown]);

  const { sourceAttempt, streamStage } = source;
  // Sources are tried only while a session is being created: once one plays, a wait (a seek, a
  // track switch) is its stream restarting, and the backend says where that stands.
  const statusMessage =
    !session && sourceAttempt && (status === 'checking' || status === 'preparing')
      ? getSourceAttemptMessage(sourceAttempt, title)
      : session && status === 'preparing' && streamStage && streamStage !== 'ready'
        ? getStreamStageMessage(streamStage, title)
        : getPlaybackStatusMessage(status, title);
  const selectedSubtitle = subtitles.selected;

  return (
    <Page ref={pageRef} aria-label="Player">
      <FocusScope id={NAV.scope}>
        {!session && <PlayerHeader onBack={onBack} />}
        {session ? (
          <>
            {avplay && playsInAvplay && avplayOpen && (
              <AvplayVideo
                avplay={avplay}
                mediaRef={setMedia}
                src={avplayOpen.src}
                startSeconds={avplayOpen.start}
                durationSeconds={session.delivery?.durationSeconds}
                aria-label={title}
                autoPlay={avplayOpen.autoplay}
                subtitleCues={selectedSubtitle ? subtitles.avplayCues : []}
                subtitleOffset={subtitles.offset}
                subtitleRaise={subtitles.controlsInset}
                subtitleFontFamily={subtitles.fontFamily}
                {...mediaEvents}
              />
            )}
            {(!(avplay && playsInAvplay) || holdingPicture) && (
              <Video
                ref={setVideoElement}
                $held={holdingPicture}
                src={audioDelivery || holdingPicture ? undefined : session.streamUrl}
                // The TV app's backend is cross-origin, and subtitle tracks only load across origins with CORS
                crossOrigin={builtForTizen ? 'anonymous' : undefined}
                aria-label={title}
                autoPlay={!audioDelivery && !holdingPicture}
                playsInline
                {...(holdingPicture ? {} : mediaEvents)}
              >
                {selectedSubtitle && subtitles.url && (
                  <track
                    key={`${selectedSubtitle.id}:${selectedSubtitle.provider === 'embedded' ? subtitles.subtitleWindow : 0}`}
                    ref={node => {
                      subtitles.trackRef.current = node;
                      if (node) node.track.mode = 'hidden';
                    }}
                    kind="subtitles"
                    srcLang={selectedSubtitle.language}
                    label={`${selectedSubtitle.languageLabel}${selectedSubtitle.hearingImpaired ? ' (SDH)' : ''}`}
                    src={subtitles.url}
                    default
                  />
                )}
              </Video>
            )}
            {!playsInAvplay && selectedSubtitle && subtitles.nativeCaption && (
              <SubtitleCaption
                text={subtitles.nativeCaption}
                raise={subtitles.controlsInset}
                fontFamily={subtitles.fontFamily}
                data-testid="subtitle-caption"
              />
            )}
            <PlayerControls
              // The controls listen to one media element; a switch to converted audio replaces it
              key={playsInAvplay ? 'avplay' : 'video'}
              prompts={
                <>
                  {prompts.inIntro && (
                    <PlayerPrompt layout="intro">
                      <Button navId="player-skip-intro" onClick={prompts.skipIntro}>
                        Skip intro
                      </Button>
                    </PlayerPrompt>
                  )}
                  {prompts.skipCountdown !== null && (
                    <PlayerPrompt layout="group" label="Credits">
                      <Button navId="player-skip-credits" onClick={prompts.skipCredits}>
                        Skip credits ({prompts.skipCountdown}s)
                      </Button>
                      <Button navId="player-watch-credits" onClick={prompts.watchCredits}>
                        Watch credits
                      </Button>
                    </PlayerPrompt>
                  )}
                  {prompts.skipCountdown === null &&
                    nextEpisode &&
                    prompts.nextCountdown !== null && (
                      <PlayerPrompt layout="group" label="Next episode">
                        <Button navId="player-next-episode" onClick={prompts.playNextEpisode}>
                          Play next episode ({prompts.nextCountdown}s)
                        </Button>
                        <Button navId="player-stay" onClick={prompts.stay}>
                          Stay
                        </Button>
                      </PlayerPrompt>
                    )}
                </>
              }
              videoRef={videoRef}
              preparing={status !== 'ready' && !pictureHeld}
              onBack={onBack}
              subtitleSearchPreferences={subtitles.searchPreferences}
              subtitleCues={subtitles.cues}
              subtitleCandidates={subtitles.candidates}
              subtitleConfigured={subtitles.configured}
              subtitleAvailable={subtitles.available}
              subtitleLoading={subtitles.loading}
              subtitleMessage={subtitles.message}
              selectedSubtitleId={subtitles.selectedId}
              subtitleOffset={subtitles.offset}
              onSearchSubtitles={subtitles.search}
              onSelectSubtitle={subtitles.select}
              onSubtitleOffsetChange={subtitles.changeOffset}
              subtitlePreferencesKey={currentUser?.id ?? null}
              onControlsInsetChange={subtitles.setControlsInset}
              onHeaderInsetChange={subtitles.setHeaderInset}
              downloadedRanges={source.downloadedRanges}
              durationSeconds={audioDelivery?.durationSeconds}
              pendingPosition={audio.pendingPosition}
              audioTracks={audio.audioTracks}
              selectedAudioTrackIndex={audio.audioTrackIndex}
              onSelectAudioTrack={audio.selectAudioTrack}
              onSeek={audioDelivery ? audio.seekConvertedAudio : undefined}
            />
            <VideoStatus
              $ready={status === 'ready' || pictureHeld}
              role="status"
              aria-live="polite"
            >
              {statusMessage}
            </VideoStatus>
          </>
        ) : (
          <Message role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'}>
            <Title>{title}</Title>
            {status === 'exhausted' ? (
              <>
                <span>
                  {availabilityRequest.isSuccess
                    ? `We'll notify you as soon as “${title}” is out.`
                    : getNoSourceMessage(title)}
                </span>
                {!availabilityRequest.isSuccess && (
                  <Button
                    navId={NAV.notify}
                    icon={<BellIcon />}
                    loading={availabilityRequest.isLoading}
                    onClick={() => void requestAvailability(playable)}
                  >
                    Notify me
                  </Button>
                )}
                {availabilityRequest.isError && (
                  <span role="alert">The notification could not be saved. Try again.</span>
                )}
              </>
            ) : (
              <span>{error ?? statusMessage}</span>
            )}
            {error && (
              <Button navId={NAV.retry} onClick={source.retry}>
                Retry
              </Button>
            )}
          </Message>
        )}
      </FocusScope>
    </Page>
  );
}
