import { useCreateSessionMutation } from '@features/player/api/playback.api';
import {
  applyProgressUpdate,
  progressForPlayable,
  useGetProgressQuery,
  useUpdateProgressMutation,
} from '@features/progress/api/progress.api';
import { RealtimeClient } from '@features/realtime/realtime.client';
import type {
  CreatePlaybackSessionResponse,
  PlayableRef,
  ProgressRequest,
} from '@miauflix/backend';
import { PALETTE } from '@shared/config/constants';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { Button as BaseButton } from '@shared/ui/button/Button';
import type { AppDispatch } from '@store/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import styled from 'styled-components';

import {
  describePlaybackFailure,
  getPlaybackStatusMessage,
  isUnavailablePlaybackFailure,
  type PlaybackStatus,
} from './playback-copy';
import { PlayerControls, PlayerHeader } from './PlayerControls';

const Page = styled.main`
  position: absolute;
  inset: 0;
  z-index: 4;
  display: grid;
  place-items: center;
  background: #000;
  outline: none;
`;

const Video = styled.video`
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
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

interface PlayerViewProps {
  playable: PlayableRef;
  title: string;
  onBack: () => void;
  realtimeClient?: RealtimeClient | null;
}

/**
 * Create a playback session and report progress during playback, on pause, completion, and cleanup.
 * Resume unfinished progress beyond five seconds by its fraction of the saved duration,
 * capped one second before the current video’s end. Preparation failures offer a retry.
 */
export function PlayerView({ playable, title, onBack, realtimeClient = null }: PlayerViewProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [createSession] = useCreateSessionMutation();
  const [updateProgress] = useUpdateProgressMutation();
  const progress = useGetProgressQuery(undefined);
  const [session, setSession] = useState<CreatePlaybackSessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PlaybackStatus>('checking');
  const [attempt, setAttempt] = useState(0);
  const requestId = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resumeApplied = useRef(false);
  const latestProgress = useRef<{
    positionSeconds: number;
    durationSeconds: number;
  } | null>(null);
  const completedRef = useRef(false);
  const realtimeClientRef = useRef<RealtimeClient | null>(realtimeClient);
  realtimeClientRef.current = realtimeClient;

  const readProgressSnapshot = useCallback(() => {
    const video = videoRef.current;
    if (video && Number.isFinite(video.duration) && video.duration > 0) {
      latestProgress.current = {
        positionSeconds: Math.min(Math.max(video.currentTime, 0), video.duration),
        durationSeconds: video.duration,
      };
    }
    return latestProgress.current;
  }, []);

  const saveProgress = useCallback(
    (state: 'playing' | 'paused' | 'completed') => {
      const snapshot = readProgressSnapshot();
      if (!snapshot) return;
      const update: ProgressRequest = {
        playable,
        ...snapshot,
        state,
      };
      if (realtimeClientRef.current?.publishProgress(update)) {
        applyProgressUpdate(dispatch, update);
        return;
      }
      void updateProgress(update);
    },
    [dispatch, playable, readProgressSnapshot, updateProgress]
  );
  const resume = progress.data ? progressForPlayable(progress.data.progress, playable) : undefined;

  useEffect(() => {
    const currentRequest = ++requestId.current;
    setSession(null);
    setError(null);
    setStatus('preparing');
    resumeApplied.current = false;
    completedRef.current = false;
    latestProgress.current = null;

    void createSession({
      playable,
      preferences: { quality: 'auto', allowHevc: false },
    })
      .unwrap()
      .then(result => {
        if (currentRequest !== requestId.current) return;
        setStatus(result.preparation.state === 'warm' ? 'ready' : 'preparing');
        setSession(result);
      })
      .catch((reason: unknown) => {
        if (currentRequest !== requestId.current) return;
        const unavailable = isUnavailablePlaybackFailure(reason);
        setStatus(unavailable ? 'unavailable' : 'error');
        setError(describePlaybackFailure(reason, title));
      });

    return () => {
      requestId.current += 1;
      if (!completedRef.current) saveProgress('paused');
    };
  }, [attempt, createSession, playable, saveProgress, title]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!completedRef.current && videoRef.current && !videoRef.current.paused)
        saveProgress('playing');
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [saveProgress]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || resumeApplied.current || !resume || resume.state === 'completed') return;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || resume.positionSeconds <= 5) {
      return;
    }
    resumeApplied.current = true;
    video.currentTime = Math.min(
      (resume.positionSeconds / resume.durationSeconds) * video.duration,
      Math.max(0, video.duration - 1)
    );
  }, [resume]);

  useEffect(() => {
    document.body.dataset['miauflixPlayer'] = 'true';
    return () => {
      delete document.body.dataset['miauflixPlayer'];
    };
  }, []);

  const navigationRef = useKeyboardNavigation({
    onBack: () => {
      onBack();
      return true;
    },
  });

  return (
    <Page ref={navigationRef} tabIndex={-1} aria-label="Player">
      {!session && <PlayerHeader onBack={onBack} />}
      {session ? (
        <>
          <Video
            ref={videoRef}
            src={session.streamUrl}
            aria-label={title}
            autoPlay
            playsInline
            onLoadedMetadata={event => {
              if (!resumeApplied.current && progress.data) {
                resumeApplied.current = true;
                if (resume && resume.state !== 'completed' && resume.positionSeconds > 5) {
                  event.currentTarget.currentTime = Math.min(
                    (resume.positionSeconds / resume.durationSeconds) *
                      event.currentTarget.duration,
                    Math.max(0, event.currentTarget.duration - 1)
                  );
                }
              }
              readProgressSnapshot();
            }}
            onTimeUpdate={readProgressSnapshot}
            onCanPlay={() => setStatus('ready')}
            onPlaying={() => {
              setStatus('ready');
              saveProgress('playing');
            }}
            onPause={() => {
              if (!completedRef.current) saveProgress('paused');
            }}
            onEnded={() => {
              completedRef.current = true;
              saveProgress('completed');
            }}
            onError={() => {
              setSession(null);
              setStatus('error');
              setError(
                `Playback for “${title}” could not load the selected source. Retry to try source preparation again.`
              );
            }}
          />
          <PlayerControls videoRef={videoRef} onBack={onBack} />
          <VideoStatus $ready={status === 'ready'} role="status" aria-live="polite">
            {getPlaybackStatusMessage(status, title)}
          </VideoStatus>
        </>
      ) : (
        <Message role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'}>
          <Title>{title}</Title>
          <span>{error ?? getPlaybackStatusMessage(status, title)}</span>
          {error && (
            <RetryButton
              type="button"
              onClick={() => {
                setError(null);
                setStatus('checking');
                setAttempt(value => value + 1);
              }}
            >
              Retry
            </RetryButton>
          )}
        </Message>
      )}
    </Page>
  );
}
