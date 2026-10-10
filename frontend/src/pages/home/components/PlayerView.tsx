import {
  useCreateSessionMutation,
  useSearchSubtitlesMutation,
} from '@features/player/api/playback.api';
import { preferredAudioTrack } from '@features/player/lib/audio-language';
import { startAudioPlayback } from '@features/player/lib/audio-playback';
import {
  mediaSubtitleKey,
  type MediaSubtitles,
  readMediaSubtitles,
  saveMediaSubtitles,
} from '@features/player/lib/media-subtitles';
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
  SubtitleCandidateDto,
} from '@miauflix/backend';
import { API_URL, PALETTE } from '@shared/config/constants';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { Button as BaseButton } from '@shared/ui/button/Button';
import { selectCurrentUser } from '@store/slices/auth';
import type { AppDispatch } from '@store/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';

import {
  describePlaybackFailure,
  getPlaybackStatusMessage,
  isUnavailablePlaybackFailure,
  type PlaybackStatus,
} from './playback-copy';
import { PlayerControls, PlayerHeader } from './PlayerControls';
import type { SubtitleTimingCue } from './SubtitleTiming';

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
  const currentUser = useSelector(selectCurrentUser);
  const [createSession] = useCreateSessionMutation();
  const [searchSubtitles] = useSearchSubtitlesMutation();
  const [updateProgress] = useUpdateProgressMutation();
  const progress = useGetProgressQuery(undefined);
  const subtitleStorageKey = mediaSubtitleKey(currentUser?.id, playable);
  const rememberedSubtitles = useRef<MediaSubtitles | null>(readMediaSubtitles(subtitleStorageKey));
  const [subtitleSearchPreferences, setSubtitleSearchPreferences] = useState<
    { language: string; hearingImpaired: boolean } | undefined
  >();
  const [session, setSession] = useState<CreatePlaybackSessionResponse | null>(null);
  const [subtitleCandidates, setSubtitleCandidates] = useState<SubtitleCandidateDto[]>([]);
  const [subtitleConfigured, setSubtitleConfigured] = useState<boolean | null>(null);
  const [subtitleAvailable, setSubtitleAvailable] = useState<boolean | null>(null);
  const [subtitleLoading, setSubtitleLoading] = useState(false);
  const [subtitleMessage, setSubtitleMessage] = useState('');
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleTimingCue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PlaybackStatus>('checking');
  const [attempt, setAttempt] = useState(0);
  const [audioSeek, setAudioSeek] = useState({ position: 0, autoplay: true, revision: 0 });
  const [pendingPosition, setPendingPosition] = useState<number | undefined>();
  const [audioTrackIndex, setAudioTrackIndex] = useState<number | undefined>();
  const audioPreparing = useRef(false);
  const deliveryRef = useRef(session?.delivery);
  deliveryRef.current = session?.delivery;
  const requestId = useRef(0);
  const sessionSubtitleStorageKey = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resumeApplied = useRef(false);
  const latestProgress = useRef<{
    positionSeconds: number;
    durationSeconds: number;
  } | null>(null);
  const completedRef = useRef(false);
  const realtimeClientRef = useRef<RealtimeClient | null>(realtimeClient);
  const subtitleTrackRef = useRef<HTMLTrackElement | null>(null);
  const subtitleRequestId = useRef(0);
  const currentStreamingKey = useRef<string | null>(null);
  const cueTimes = useRef(new WeakMap<TextTrackCue, { start: number; end: number }>());
  const subtitleOffsetRef = useRef(0);
  realtimeClientRef.current = realtimeClient;
  currentStreamingKey.current = session?.streamingKey ?? null;
  subtitleOffsetRef.current = subtitleOffset;

  useEffect(() => {
    subtitleRequestId.current += 1;
    setSubtitleCandidates([]);
    setSubtitleConfigured(null);
    setSubtitleAvailable(null);
    setSubtitleLoading(false);
    setSubtitleMessage('');
    setSelectedSubtitleId(null);
    setSubtitleCues([]);
    setSubtitleOffset(0);
    cueTimes.current = new WeakMap();
    return () => {
      subtitleRequestId.current += 1;
    };
  }, [session?.streamingKey]);

  const applySubtitleOffset = useCallback(() => {
    const cues = subtitleTrackRef.current?.track.cues;
    if (!cues) return;
    for (const cue of cues) {
      let original = cueTimes.current.get(cue);
      if (!original) {
        original = { start: cue.startTime, end: cue.endTime };
        cueTimes.current.set(cue, original);
      }
      const offset = subtitleOffsetRef.current;
      cue.startTime = Math.max(0, original.start + offset);
      cue.endTime = Math.max(cue.startTime + 0.01, original.end + offset);
    }
  }, []);

  const handleSubtitleLoaded = useCallback(() => {
    const cues = subtitleTrackRef.current?.track.cues;
    if (cues)
      setSubtitleCues(
        Array.from(cues).map(cue => {
          const original = cueTimes.current.get(cue) ?? { start: cue.startTime, end: cue.endTime };
          const vttCue = cue as VTTCue;
          const text =
            typeof vttCue.getCueAsHTML === 'function'
              ? (vttCue.getCueAsHTML().textContent ?? '')
              : (vttCue.text ?? '');
          return { ...original, text };
        })
      );
    applySubtitleOffset();
  }, [applySubtitleOffset]);

  const handleSubtitleSearch = useCallback(
    async (language: string, hearingImpaired: boolean, restoring = false) => {
      if (!session || sessionSubtitleStorageKey.current !== subtitleStorageKey) return;
      const request = ++subtitleRequestId.current;
      const streamingKey = session.streamingKey;
      setSubtitleLoading(true);
      setSubtitleMessage('');
      setSelectedSubtitleId(null);
      setSubtitleCues([]);
      setSubtitleOffset(0);
      setSubtitleSearchPreferences({ language, hearingImpaired });
      const saved = rememberedSubtitles.current;
      const remembered =
        restoring || (saved?.language === language && saved?.hearingImpaired === hearingImpaired)
          ? saved
          : null;
      try {
        const result = await searchSubtitles({
          streamingKey,
          language,
          hearingImpaired,
          refresh: !restoring,
        }).unwrap();
        if (subtitleRequestId.current !== request || currentStreamingKey.current !== streamingKey)
          return;
        setSubtitleCandidates(result.candidates);
        setSubtitleConfigured(result.configured);
        setSubtitleAvailable(result.available);
        if (result.available && result.configured) {
          const selected =
            remembered?.selectedFileId == null
              ? undefined
              : result.candidates.find(candidate => candidate.fileId === remembered.selectedFileId);
          const preferences: MediaSubtitles = {
            language,
            hearingImpaired,
            selectedFileId: selected?.fileId ?? null,
            offset: selected ? (remembered?.offset ?? 0) : 0,
          };
          rememberedSubtitles.current = preferences;
          saveMediaSubtitles(subtitleStorageKey, preferences);
          setSelectedSubtitleId(selected?.id ?? null);
          setSubtitleOffset(preferences.offset);
        }
        setSubtitleMessage(
          result.configured && result.available && result.candidates.length === 0
            ? 'No subtitles found for this language.'
            : ''
        );
      } catch {
        if (subtitleRequestId.current === request && currentStreamingKey.current === streamingKey) {
          setSubtitleAvailable(false);
          setSubtitleMessage('Subtitle search failed. Playback can continue.');
        }
      } finally {
        if (subtitleRequestId.current === request) setSubtitleLoading(false);
      }
    },
    [searchSubtitles, session, subtitleStorageKey]
  );

  useEffect(() => {
    if (!session || sessionSubtitleStorageKey.current !== subtitleStorageKey) return;
    rememberedSubtitles.current = readMediaSubtitles(subtitleStorageKey);
    const remembered = rememberedSubtitles.current;
    if (remembered)
      void handleSubtitleSearch(remembered.language, remembered.hearingImpaired, true);
  }, [session, subtitleStorageKey, handleSubtitleSearch]);

  const handleSubtitleSelect = useCallback(
    (id: string | null) => {
      setSelectedSubtitleId(id);
      setSubtitleCues([]);
      setSubtitleOffset(0);
      setSubtitleMessage('');
      cueTimes.current = new WeakMap();
      const remembered = rememberedSubtitles.current;
      if (remembered) {
        const next = {
          ...remembered,
          selectedFileId: subtitleCandidates.find(candidate => candidate.id === id)?.fileId ?? null,
          offset: 0,
        };
        rememberedSubtitles.current = next;
        saveMediaSubtitles(subtitleStorageKey, next);
      }
    },
    [subtitleCandidates, subtitleStorageKey]
  );

  const handleSubtitleOffsetChange = useCallback(
    (offset: number) => {
      setSubtitleOffset(offset);
      const remembered = rememberedSubtitles.current;
      if (remembered) {
        const next = { ...remembered, offset };
        rememberedSubtitles.current = next;
        saveMediaSubtitles(subtitleStorageKey, next);
      }
    },
    [subtitleStorageKey]
  );

  const readProgressSnapshot = useCallback(() => {
    if (audioPreparing.current) return latestProgress.current;
    const video = videoRef.current;
    const duration =
      deliveryRef.current?.mode === 'audio-transcode'
        ? deliveryRef.current.durationSeconds
        : video?.duration;
    if (video && duration !== undefined && Number.isFinite(duration) && duration > 0) {
      latestProgress.current = {
        positionSeconds: Math.min(Math.max(video.currentTime, 0), duration),
        durationSeconds: duration,
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
  const selectedSubtitle = subtitleCandidates.find(
    candidate => candidate.id === selectedSubtitleId
  );
  const resumeRef = useRef(resume);
  resumeRef.current = resume;
  const hasProgress = !!progress.data;
  const audioDelivery =
    session?.delivery?.mode === 'audio-transcode' ? session.delivery : undefined;

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
        position = Math.min(
          (saved.positionSeconds / saved.durationSeconds) * audioDelivery.durationSeconds,
          Math.max(0, audioDelivery.durationSeconds - 1)
        );
      }
    }
    const video = videoRef.current;
    if (!video) return;
    audioPreparing.current = true;
    setStatus('preparing');
    setPendingPosition(position);
    return startAudioPlayback({
      video,
      url: session.streamUrl,
      mimeType: audioDelivery.mimeType,
      durationSeconds: audioDelivery.durationSeconds,
      startSeconds: position,
      autoplay: audioSeek.autoplay,
      audioTrackIndex,
      onReady: () => {
        audioPreparing.current = false;
        setPendingPosition(undefined);
        setStatus('ready');
      },
      onError: message => {
        setStatus('error');
        setError(message);
        setSession(null);
      },
    });
  }, [session, audioDelivery, audioSeek, hasProgress, audioTrackIndex]);

  useEffect(() => {
    const track = subtitleTrackRef.current;
    if (!track || !selectedSubtitle) return;
    const failed = () => setSubtitleMessage('The selected subtitle could not be loaded.');
    // Track load/error events do not bubble; subscribe to the native element.
    track.addEventListener('load', handleSubtitleLoaded);
    track.addEventListener('error', failed);
    if (track.readyState === 2) handleSubtitleLoaded();
    return () => {
      track.removeEventListener('load', handleSubtitleLoaded);
      track.removeEventListener('error', failed);
    };
  }, [selectedSubtitle, handleSubtitleLoaded]);

  useEffect(() => {
    const track = subtitleTrackRef.current;
    if (!track) return;
    track.track.mode = selectedSubtitle ? 'showing' : 'disabled';
    if (selectedSubtitle) applySubtitleOffset();
  }, [applySubtitleOffset, selectedSubtitle, subtitleOffset, audioSeek, audioTrackIndex]);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    sessionSubtitleStorageKey.current = null;
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
        setAudioSeek({ position: 0, autoplay: true, revision: 0 });
        setPendingPosition(undefined);
        setAudioTrackIndex(preferredAudioTrack(result.delivery));
        audioPreparing.current = result.delivery?.mode === 'audio-transcode';
        sessionSubtitleStorageKey.current = subtitleStorageKey;
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
  }, [attempt, createSession, playable, saveProgress, subtitleStorageKey, title]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (
        !audioPreparing.current &&
        !completedRef.current &&
        videoRef.current &&
        !videoRef.current.paused
      )
        saveProgress('playing');
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [saveProgress]);

  useEffect(() => {
    const video = videoRef.current;
    if (audioDelivery || !video || resumeApplied.current || !resume || resume.state === 'completed')
      return;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || resume.positionSeconds <= 5) {
      return;
    }
    resumeApplied.current = true;
    video.currentTime = Math.min(
      (resume.positionSeconds / resume.durationSeconds) * video.duration,
      Math.max(0, video.duration - 1)
    );
  }, [resume, audioDelivery]);

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
            src={audioDelivery ? undefined : session.streamUrl}
            aria-label={title}
            autoPlay={!audioDelivery}
            playsInline
            onLoadedMetadata={event => {
              if (audioDelivery) return;
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
            onTimeUpdate={() => {
              if (!audioPreparing.current) readProgressSnapshot();
            }}
            onCanPlay={() => {
              if (!audioPreparing.current) setStatus('ready');
            }}
            onPlaying={() => {
              if (!audioPreparing.current) {
                setStatus('ready');
                saveProgress('playing');
              }
            }}
            onPause={() => {
              if (!audioPreparing.current && !completedRef.current) saveProgress('paused');
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
          >
            {selectedSubtitle && (
              <track
                key={selectedSubtitle.id}
                ref={node => {
                  subtitleTrackRef.current = node;
                  if (node) node.track.mode = 'showing';
                }}
                kind="subtitles"
                srcLang={selectedSubtitle.language}
                label={`${selectedSubtitle.languageLabel}${selectedSubtitle.hearingImpaired ? ' (SDH)' : ''}`}
                src={`${API_URL.replace(/\/+$/, '')}/api/subtitles/tracks/${encodeURIComponent(selectedSubtitle.id)}`}
                default
              />
            )}
          </Video>
          <PlayerControls
            videoRef={videoRef}
            onBack={onBack}
            subtitleSearchPreferences={subtitleSearchPreferences}
            subtitleCues={subtitleCues}
            subtitleCandidates={subtitleCandidates}
            subtitleConfigured={subtitleConfigured}
            subtitleAvailable={subtitleAvailable}
            subtitleLoading={subtitleLoading}
            subtitleMessage={subtitleMessage}
            selectedSubtitleId={selectedSubtitleId}
            subtitleOffset={subtitleOffset}
            onSearchSubtitles={handleSubtitleSearch}
            onSelectSubtitle={handleSubtitleSelect}
            onSubtitleOffsetChange={handleSubtitleOffsetChange}
            subtitlePreferencesKey={currentUser?.id ?? null}
            durationSeconds={audioDelivery?.durationSeconds}
            pendingPosition={pendingPosition}
            audioTracks={audioDelivery?.audioTracks}
            selectedAudioTrackIndex={audioTrackIndex}
            onSelectAudioTrack={index => {
              const position = pendingPosition ?? videoRef.current?.currentTime ?? 0;
              const autoplay = audioPreparing.current
                ? audioSeek.autoplay
                : !videoRef.current?.paused;
              resumeApplied.current = true;
              audioPreparing.current = true;
              setPendingPosition(position);
              setAudioTrackIndex(index);
              setAudioSeek(previous => ({ position, autoplay, revision: previous.revision + 1 }));
            }}
            onSeek={
              audioDelivery
                ? position => {
                    const autoplay = audioPreparing.current
                      ? audioSeek.autoplay
                      : !videoRef.current?.paused;
                    resumeApplied.current = true;
                    audioPreparing.current = true;
                    setPendingPosition(position);
                    setAudioSeek(previous => ({
                      position,
                      autoplay,
                      revision: previous.revision + 1,
                    }));
                  }
                : undefined
            }
          />
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
