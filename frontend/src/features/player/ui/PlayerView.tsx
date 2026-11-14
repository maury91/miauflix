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
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { Button as BaseButton } from '@shared/ui/button/Button';
import { selectCurrentUser } from '@store/slices/auth';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';

import {
  getNoSourceMessage,
  getPlaybackStatusMessage,
  getSourceAttemptMessage,
} from '../lib/playback-copy';
import { AvplayVideo, type PlayerMediaEvents } from './AvplayVideo';
import { PlayerControls, PlayerHeader } from './PlayerControls';
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
  gap: 1rem;
  width: min(90vw, 36rem);
  color: ${PALETTE.text.primary};
  text-align: center;
`;

const Title = styled.h1`
  margin: 0;
  color: ${PALETTE.text.primary};
  font-size: clamp(1.4rem, 3vw, 2.2rem);
`;

const VideoStatus = styled.p<{ $ready: boolean }>`
  position: fixed;
  right: 1rem;
  top: 5rem;
  left: 1rem;
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

// eslint-disable-next-line no-restricted-syntax -- Existing media/player interaction and TV-scaled chrome; see shared/ui/README.md.
const BackButton = styled(BaseButton)`
  min-width: 0;
  min-height: 0;
  justify-self: center;
  padding: 0.7rem 1.2rem;
  border: 1px solid ${PALETTE.background.border};
  border-radius: 0.35rem;
  background: ${PALETTE.background.surface2};
  color: ${PALETTE.text.primary};
  box-shadow: none;
  cursor: pointer;
`;

const RetryButton = styled(BackButton)`
  background: ${PALETTE.color.interactive};
`;

const NotifyButton = styled(RetryButton)`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;

  svg {
    width: 1.2em;
    height: 1.2em;
  }
`;

const NextEpisodePrompt = styled.div`
  position: fixed;
  z-index: 6;
  left: 50%;
  bottom: 16vh;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  transform: translateX(-50%);
  padding: 0.75rem;
  border-radius: 0.5rem;
  background: rgba(0, 0, 0, 0.82);
`;

/** Netflix-style: a plain button at the bottom right, above the controls, with no countdown. */
const SkipIntroButton = styled(BackButton)`
  position: fixed;
  z-index: 6;
  right: 4vw;
  bottom: 16vh;
  background: rgba(0, 0, 0, 0.82);
  border: 2px solid rgba(255, 255, 255, 0.85);

  /* Selected with the remote: filled, so it reads from across the room. */
  &:focus {
    background: #fff;
    color: #000;
  }
`;

const NextEpisodeButton = styled(BackButton)`
  background: ${PALETTE.color.interactive};
`;

interface PlayerViewProps {
  playable: PlayableRef;
  title: string;
  onBack: () => void;
  nextEpisode: NextEpisode | null;
  onPlayNext: () => void;
}

/**
 * Play a target: create its playback session (walking its sources on failure, with a retry),
 * deliver its audio, report and resume progress, draw subtitles, and offer intro/credits skips
 * and the next episode. Each concern lives in a hook under `features/player/hooks`.
 */
export function PlayerView({ playable, title, onBack, nextEpisode, onPlayNext }: PlayerViewProps) {
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
      // A held picture going away must not drop the player that replaced it.
      if (videoRef.current === videoElement.current) setMedia(null);
      // A held picture kept its converted stream attached: let the decoder go.
      if (videoElement.current?.getAttribute('src')?.startsWith('blob:')) {
        videoElement.current.removeAttribute('src');
        videoElement.current.load();
      }
      videoElement.current = null;
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
    const timer = window.setTimeout(releasePicture, PICTURE_HOLD_LIMIT_MS);
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
  // asked to start where playback will (the held picture, else the resume point), once per stream.
  const avplayStart = useRef<{ streamUrl: string; src: string; start: number } | null>(null);
  const avplayOpen = (() => {
    if (!session || session.delivery?.mode !== 'remux')
      return { src: session?.streamUrl ?? '', start: undefined };
    if (avplayStart.current?.streamUrl === session.streamUrl) return avplayStart.current;
    const saved = resume.resumeRef.current;
    const duration = session.delivery.durationSeconds;
    const start =
      pictureHeld && videoElement.current
        ? videoElement.current.currentTime
        : saved && saved.state !== 'completed' && saved.positionSeconds > 5 && duration > 0
          ? resumePosition(saved, duration)
          : 0;
    const src = `${session.streamUrl}?start=${Math.floor(start)}`;
    avplayStart.current = { streamUrl: session.streamUrl, src, start };
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

  const pageRef = useRef<HTMLElement | null>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const notifyRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useKeyboardNavigation({
    // A remote needs something focused: the failure's action, else the player (for Back).
    onRestoreFocus: () => {
      const target = retryRef.current ?? notifyRef.current ?? pageRef.current;
      target?.focus({ preventScroll: true });
      return !!target;
    },
    onBack: () => {
      onBack();
      return true;
    },
  });
  const setPage = useCallback(
    (element: HTMLElement | null) => {
      pageRef.current = element;
      navigationRef(element);
    },
    [navigationRef]
  );
  // While preparing, the player itself takes the focus, so a remote's Back works
  useEffect(() => {
    if (!document.activeElement || document.activeElement === document.body)
      pageRef.current?.focus({ preventScroll: true });
  }, []);
  // A remote needs something focused: the failure's action, else the player (for Back).
  // Retry unmounts its own button, dropping the focus on the body: hand it back to the player.
  useEffect(() => {
    if (error || status === 'exhausted') {
      (retryRef.current ?? notifyRef.current ?? pageRef.current)?.focus({ preventScroll: true });
      return;
    }
    if (!document.activeElement || document.activeElement === document.body)
      pageRef.current?.focus({ preventScroll: true });
  }, [error, status, availabilityRequest.isSuccess]);

  const { sourceAttempt } = source;
  const statusMessage =
    sourceAttempt && (status === 'checking' || status === 'preparing')
      ? getSourceAttemptMessage(sourceAttempt, title)
      : getPlaybackStatusMessage(status, title);
  const selectedSubtitle = subtitles.selected;

  return (
    <Page ref={setPage} tabIndex={-1} aria-label="Player">
      {!session && <PlayerHeader onBack={onBack} />}
      {session ? (
        <>
          {avplay && playsInAvplay && (
            <AvplayVideo
              avplay={avplay}
              mediaRef={setMedia}
              src={avplayOpen.src}
              startSeconds={avplayOpen.start}
              durationSeconds={session.delivery?.durationSeconds}
              aria-label={title}
              autoPlay
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
                  <SkipIntroButton type="button" onClick={prompts.skipIntro}>
                    Skip intro
                  </SkipIntroButton>
                )}
                {prompts.skipCountdown !== null && (
                  <NextEpisodePrompt role="group" aria-label="Credits">
                    <NextEpisodeButton type="button" onClick={prompts.skipCredits}>
                      Skip credits ({prompts.skipCountdown}s)
                    </NextEpisodeButton>
                    <BackButton type="button" onClick={prompts.watchCredits}>
                      Watch credits
                    </BackButton>
                  </NextEpisodePrompt>
                )}
                {prompts.skipCountdown === null &&
                  nextEpisode &&
                  prompts.nextCountdown !== null && (
                    <NextEpisodePrompt role="group" aria-label="Next episode">
                      <NextEpisodeButton type="button" onClick={prompts.playNextEpisode}>
                        Play next episode ({prompts.nextCountdown}s)
                      </NextEpisodeButton>
                      <BackButton type="button" onClick={prompts.stay}>
                        Stay
                      </BackButton>
                    </NextEpisodePrompt>
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
          <VideoStatus $ready={status === 'ready' || pictureHeld} role="status" aria-live="polite">
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
                <NotifyButton
                  ref={notifyRef}
                  type="button"
                  disabled={availabilityRequest.isLoading}
                  onClick={() => void requestAvailability(playable)}
                >
                  <BellIcon aria-hidden="true" />
                  Notify me
                </NotifyButton>
              )}
              {availabilityRequest.isError && (
                <span role="alert">The notification could not be saved. Try again.</span>
              )}
            </>
          ) : (
            <span>{error ?? statusMessage}</span>
          )}
          {error && (
            <RetryButton ref={retryRef} type="button" onClick={source.retry}>
              Retry
            </RetryButton>
          )}
        </Message>
      )}
    </Page>
  );
}
