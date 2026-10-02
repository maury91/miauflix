import { useCreateSessionMutation } from '@features/player/api/playback.api';
import {
  progressForPlayable,
  useGetProgressQuery,
  useUpdateProgressMutation,
} from '@features/progress/api/progress.api';
import type { CreatePlaybackSessionResponse, PlayableRef } from '@miauflix/backend';
import { PALETTE } from '@shared/config/constants';
import { useCallback, useEffect, useRef, useState } from 'react';
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

const BackButton = styled.button`
  justify-self: center;
  padding: 0.7rem 1.2rem;
  border: 1px solid ${PALETTE.background.border};
  border-radius: 0.35rem;
  background: ${PALETTE.background.surface2};
  color: ${PALETTE.text.primary};
  cursor: pointer;
`;

const RetryButton = styled(BackButton)`
  background: ${PALETTE.color.interactive};
`;

interface PlayerViewProps {
  playable: PlayableRef;
  title: string;
  onBack: () => void;
}

export function PlayerView({ playable, title, onBack }: PlayerViewProps) {
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

  const saveProgress = useCallback(
    (state: 'playing' | 'paused' | 'completed') => {
      const video = videoRef.current;
      if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
      void updateProgress({
        playable,
        positionSeconds: Math.min(video.currentTime, video.duration),
        durationSeconds: video.duration,
        state,
      });
    },
    [playable, updateProgress]
  );

  useEffect(() => {
    const currentRequest = ++requestId.current;
    setSession(null);
    setError(null);
    setStatus('preparing');
    resumeApplied.current = false;

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
      saveProgress('paused');
    };
  }, [attempt, createSession, playable, saveProgress, title]);

  useEffect(() => {
    const timer = window.setInterval(() => saveProgress('playing'), 10_000);
    return () => window.clearInterval(timer);
  }, [saveProgress]);

  useEffect(() => {
    document.body.dataset['miauflixPlayer'] = 'true';
    return () => {
      delete document.body.dataset['miauflixPlayer'];
    };
  }, []);

  const resume = progress.data ? progressForPlayable(progress.data.progress, playable) : undefined;

  return (
    <Page
      tabIndex={-1}
      aria-label="Player"
      onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'Backspace') {
          event.preventDefault();
          event.stopPropagation();
          onBack();
        } else {
          event.stopPropagation();
        }
      }}
    >
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
              if (resumeApplied.current) return;
              resumeApplied.current = true;
              if (resume && resume.state !== 'completed' && resume.positionSeconds > 5) {
                event.currentTarget.currentTime = Math.min(
                  resume.positionSeconds,
                  Math.max(0, event.currentTarget.duration - 1)
                );
              }
            }}
            onCanPlay={() => setStatus('ready')}
            onPlaying={() => setStatus('ready')}
            onPause={() => saveProgress('paused')}
            onEnded={() => saveProgress('completed')}
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
