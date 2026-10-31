import { useRequestAvailabilityMutation } from '@features/notifications/api/notifications.api';
import {
  type PlaybackPreferences,
  useCreateSessionMutation,
  useSearchSubtitlesMutation,
} from '@features/player/api/playback.api';
import { playbackAudioCapabilities } from '@features/player/lib/audio-language';
import { startAudioPlayback } from '@features/player/lib/audio-playback';
import {
  AVPLAY_CAPABILITIES,
  getAvplay,
  type PlayerMedia,
} from '@features/player/lib/avplay-media';
import {
  mediaSubtitleKey,
  type MediaSubtitles,
  readMediaSubtitles,
  saveMediaSubtitles,
} from '@features/player/lib/media-subtitles';
import { parseVtt, type SubtitleCue } from '@features/player/lib/vtt';
import { progressForPlayable, useGetProgressQuery } from '@features/progress/api/progress.api';
import { saveProgressWithRealtime } from '@features/realtime/realtime.middleware';
import type {
  CreatePlaybackSessionResponse,
  PlayableRef,
  ProgressRequest,
  SubtitleCandidateDto,
} from '@miauflix/backend';
import { API_CREDENTIALS, API_URL, builtForTizen, PALETTE } from '@shared/config/constants';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { Button as BaseButton } from '@shared/ui/button/Button';
import { selectCurrentUser } from '@store/slices/auth';
import {
  realtimeActions,
  selectPlaybackDelivery,
  selectSourceAttempt,
} from '@store/slices/realtime';
import type { AppDispatch } from '@store/store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';

import { AvplayVideo, type PlayerMediaEvents } from './AvplayVideo';
import {
  describePlaybackFailure,
  getNoSourceMessage,
  getPlaybackStatusMessage,
  getSourceAttemptMessage,
  isUnavailablePlaybackFailure,
  type PlaybackStatus,
} from './playback-copy';
import { PlayerControls, PlayerHeader } from './PlayerControls';
import type { SubtitleTimingCue } from './SubtitleTiming';

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

const NextEpisodeButton = styled(BackButton)`
  background: ${PALETTE.color.interactive};
`;

/** Backend paths as URLs in the TV app: its page is a local file, so relative paths miss the backend. */
function backendUrl(path: string): string {
  return builtForTizen && path.startsWith('/') ? `${API_URL.replace(/\/+$/, '')}${path}` : path;
}

/** What this client can decode, so the backend can choose how to deliver the file. */
function playbackPreferences(avplay: boolean): PlaybackPreferences {
  return {
    quality: 'auto',
    ...playbackAudioCapabilities(document.createElement('video')),
    ...(avplay ? AVPLAY_CAPABILITIES : {}),
  };
}

interface PlayerViewProps {
  playable: PlayableRef;
  title: string;
  onBack: () => void;
  nextEpisode: { playable: PlayableRef; title: string } | null;
  onPlayNext: () => void;
}

/**
 * Create a playback session and report progress during playback, on pause, completion, and cleanup.
 * Resume unfinished progress beyond five seconds by its fraction of the saved duration,
 * capped one second before the current video’s end. Preparation failures offer a retry.
 */
export function PlayerView({ playable, title, onBack, nextEpisode, onPlayNext }: PlayerViewProps) {
  const dispatch = useDispatch<AppDispatch>();
  const currentUser = useSelector(selectCurrentUser);
  const [createSession, sessionRequest] = useCreateSessionMutation();
  const [createNextSession] = useCreateSessionMutation();
  const resetSessionRequestRef = useRef(sessionRequest.reset);
  resetSessionRequestRef.current = sessionRequest.reset;
  const resetSessionRequest = useCallback(() => resetSessionRequestRef.current(), []);
  const createdSession = sessionRequest.data ?? null;
  // Streams start before the file is probed; the probe's delivery arrives over realtime.
  const deliveryUpdate = useSelector(selectPlaybackDelivery(createdSession?.playbackId));
  const session = useMemo(
    () =>
      createdSession && deliveryUpdate?.type === 'delivery'
        ? {
            ...createdSession,
            delivery: deliveryUpdate.delivery,
            streamUrl: backendUrl(deliveryUpdate.streamUrl),
            deliveryPending: false,
          }
        : createdSession && { ...createdSession, streamUrl: backendUrl(createdSession.streamUrl) },
    [createdSession, deliveryUpdate]
  );
  /** Samsung TVs play through AVPlay, which decodes far more than their browser does. */
  const [avplay] = useState(() => (builtForTizen ? getAvplay() : undefined));
  /** The direct stream failed before the probe said how this file must be delivered. */
  const directFailedWhilePending = useRef(false);
  /**
   * Sources whose stream failed for this playable. The backend rules out fakes and stalled
   * swarms, so each new session normally brings the next candidate; a repeat ends the walk.
   */
  const failedSources = useRef<{ key: string; ids: Set<number> }>({ key: '', ids: new Set() });
  const pushedAttempt = useSelector(selectSourceAttempt(playable));
  const [requestAvailability, availabilityRequest] = useRequestAvailabilityMutation();
  const [prefetchedNextSession, setPrefetchedNextSession] =
    useState<CreatePlaybackSessionResponse | null>(null);
  const prefetchedNextRef = useRef<CreatePlaybackSessionResponse | null>(null);
  const nextRequestInFlight = useRef<Promise<void> | null>(null);
  /** The next episode that already got its one retry at the 70% prefetch point. */
  const nextRetriedAtPrefetch = useRef<string | null>(null);
  const nextEpisodeKeyRef = useRef<string | null>(null);
  const nextDownloadStarted = useRef<string | null>(null);
  const [nextSearchReached, setNextSearchReached] = useState(false);
  const nextDismissed = useRef<string | null>(null);
  const nextTransitioned = useRef<string | null>(null);
  const suppressCreditAfterSeek = useRef(false);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const nextEpisodeKey = nextEpisode
    ? `${nextEpisode.playable.kind === 'movie' ? `m:${nextEpisode.playable.mediaId}` : `e:${nextEpisode.playable.showMediaId}:${nextEpisode.playable.seasonNumber}:${nextEpisode.playable.episodeNumber}`}`
    : null;
  const nextEpisodeRef = useRef(nextEpisode);
  nextEpisodeRef.current = nextEpisode;
  nextEpisodeKeyRef.current = nextEpisodeKey;
  const [searchSubtitles] = useSearchSubtitlesMutation();
  const progress = useGetProgressQuery(undefined);
  const subtitleStorageKey = mediaSubtitleKey(currentUser?.id, playable);
  const rememberedSubtitles = useRef<MediaSubtitles | null>(readMediaSubtitles(subtitleStorageKey));
  const [subtitleSearchPreferences, setSubtitleSearchPreferences] = useState<
    { language: string; hearingImpaired: boolean } | undefined
  >();
  const [subtitleCandidates, setSubtitleCandidates] = useState<SubtitleCandidateDto[]>([]);
  const [subtitleConfigured, setSubtitleConfigured] = useState<boolean | null>(null);
  const [subtitleAvailable, setSubtitleAvailable] = useState<boolean | null>(null);
  const [subtitleLoading, setSubtitleLoading] = useState(false);
  const [subtitleMessage, setSubtitleMessage] = useState('');
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [subtitleWindow, setSubtitleWindow] = useState(0);
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
  const sessionInFlight = useRef<{
    key: string;
    promise: Promise<CreatePlaybackSessionResponse>;
  } | null>(null);

  const sessionSubtitleStorageKey = useRef<string | null>(null);
  const videoRef = useRef<PlayerMedia | null>(null);
  const setMedia = useCallback((media: PlayerMedia | null) => {
    videoRef.current = media;
  }, []);
  const resumeApplied = useRef(false);
  const latestProgress = useRef<{
    positionSeconds: number;
    durationSeconds: number;
  } | null>(null);
  const completedRef = useRef(false);
  const subtitleTrackRef = useRef<HTMLTrackElement | null>(null);
  const subtitleRequestId = useRef(0);
  const currentStreamingKey = useRef<string | null>(null);
  const cueTimes = useRef(new WeakMap<TextTrackCue, { start: number; end: number }>());
  const resume = progress.data ? progressForPlayable(progress.data.progress, playable) : undefined;
  const resumeRef = useRef(resume);
  resumeRef.current = resume;
  const subtitleOffsetRef = useRef(0);
  currentStreamingKey.current = session?.streamingKey ?? null;
  subtitleOffsetRef.current = subtitleOffset;

  const prepareNextEpisode = useCallback(
    (atPrefetchPoint = false) => {
      const target = nextEpisodeRef.current;
      const key = nextEpisodeKeyRef.current;
      if (!target || !key) return Promise.resolve();
      if (prefetchedNextRef.current && nextEpisodeKeyRef.current === key) return Promise.resolve();
      if (nextRequestInFlight.current) return nextRequestInFlight.current;
      if (atPrefetchPoint) {
        // Every timeupdate past 70% lands here; a failing source gets one retry, not one per tick.
        if (nextRetriedAtPrefetch.current === key) return Promise.resolve();
        nextRetriedAtPrefetch.current = key;
      }
      const request = createNextSession({
        playable: target.playable,
        deferDownload: true,
        preferences: playbackPreferences(!!avplay),
      })
        .unwrap()
        .then(result => {
          if (nextEpisodeKeyRef.current !== key) return;
          prefetchedNextRef.current = result;
          setPrefetchedNextSession(result);
        })
        .catch(() => {
          // A missing next source is retried once playback reaches the 70% prefetch point.
        })
        .finally(() => {
          if (nextRequestInFlight.current === request) nextRequestInFlight.current = null;
        });
      nextRequestInFlight.current = request;
      return request;
    },
    [avplay, createNextSession]
  );

  const startNextEpisodeDownload = useCallback(() => {
    if (
      !nextEpisodeKey ||
      !prefetchedNextRef.current ||
      nextDownloadStarted.current === nextEpisodeKey
    )
      return;
    nextDownloadStarted.current = nextEpisodeKey;
    const streamUrl = backendUrl(prefetchedNextRef.current.streamUrl.replace(/\/audio$/, ''));
    void fetch(`${streamUrl}/prefetch`, {
      method: 'POST',
      cache: 'no-store',
    })
      .then(async response => {
        if (!response.ok) throw new Error('Next episode download could not start');
        await response.body?.cancel();
      })
      .catch(() => {
        // Prefetch is best-effort. Retrying on every media timeupdate would
        // flood the route when capacity is unavailable; playback itself retries.
      });
  }, [nextEpisodeKey]);

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
      void dispatch(saveProgressWithRealtime(update));
    },
    [dispatch, playable, readProgressSnapshot]
  );

  const playNextEpisode = useCallback(() => {
    if (!nextEpisodeKey || nextTransitioned.current === nextEpisodeKey) return;
    nextTransitioned.current = nextEpisodeKey;
    setNextCountdown(null);
    // Skipping the credits still finishes this episode; onEnded may never fire.
    if (!completedRef.current) {
      completedRef.current = true;
      saveProgress('completed');
    }
    onPlayNext();
  }, [nextEpisodeKey, onPlayNext, saveProgress]);

  const updateNextCountdown = useCallback(() => {
    const video = videoRef.current;
    if (
      !video ||
      !session ||
      !nextEpisodeKey ||
      !prefetchedNextRef.current ||
      session?.episodeMatchKind === 'combined' ||
      nextDismissed.current === nextEpisodeKey ||
      nextTransitioned.current === nextEpisodeKey
    ) {
      setNextCountdown(null);
      return;
    }
    const duration =
      session.delivery?.durationSeconds ?? (Number.isFinite(video.duration) ? video.duration : 0);
    if (!Number.isFinite(duration) || duration <= 0) {
      setNextCountdown(null);
      return;
    }
    const creditsStart = session.delivery?.creditsStartSeconds;
    const hasCreditsMarker =
      !suppressCreditAfterSeek.current &&
      creditsStart !== undefined &&
      Number.isFinite(creditsStart) &&
      creditsStart > 0 &&
      creditsStart < duration;
    let remaining: number | null = null;
    if (hasCreditsMarker) {
      if (video.currentTime >= creditsStart!) remaining = 5 - (video.currentTime - creditsStart!);
    } else {
      const threshold = duration <= 90 ? 0 : duration - 90;
      if (video.currentTime >= threshold) remaining = duration - video.currentTime;
    }
    if (remaining === null) {
      setNextCountdown(null);
      return;
    }
    const seconds = Math.max(0, Math.ceil(remaining));
    setNextCountdown(seconds);
    if (remaining <= 0) playNextEpisode();
  }, [nextEpisodeKey, playNextEpisode, session]);

  useEffect(() => {
    prefetchedNextRef.current = null;
    setPrefetchedNextSession(null);
    nextDownloadStarted.current = null;
    nextRetriedAtPrefetch.current = null;
    setNextSearchReached(false);
    nextDismissed.current = null;
    nextTransitioned.current = null;
    suppressCreditAfterSeek.current = false;
    setNextCountdown(null);
  }, [playable, nextEpisodeKey]);

  useEffect(() => {
    if (session?.streamingKey && nextEpisodeKey) void prepareNextEpisode();
  }, [session?.streamingKey, nextEpisodeKey, prepareNextEpisode]);

  useEffect(() => {
    if (nextSearchReached && prefetchedNextSession) startNextEpisodeDownload();
  }, [nextSearchReached, prefetchedNextSession, startNextEpisodeDownload]);

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

  useEffect(() => {
    setSubtitleWindow(
      Math.floor(Math.max(0, (videoRef.current?.currentTime ?? 0) - subtitleOffset) / 60) * 60
    );
  }, [subtitleOffset]);

  const handleSubtitleLoaded = useCallback(() => {
    const cues = subtitleTrackRef.current?.track.cues;
    if (cues)
      setSubtitleCues(
        Array.from(cues).map(cue => {
          const original = cueTimes.current.get(cue) ?? { start: cue.startTime, end: cue.endTime };
          const vttCue = cue as VTTCue;
          // Keep the entire caption above the playback controls and screen edge.
          vttCue.snapToLines = false;
          vttCue.line = 75;
          vttCue.lineAlign = 'end';
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
    async (language: string, hearingImpaired: boolean, restoring = false, localOnly = false) => {
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
          ...(localOnly ? { localOnly: true } : {}),
        }).unwrap();
        if (subtitleRequestId.current !== request || currentStreamingKey.current !== streamingKey)
          return;
        setSubtitleCandidates(result.candidates);
        setSubtitleConfigured(result.configured);
        setSubtitleAvailable(result.available);
        if (result.available && (result.configured || result.candidates.length > 0)) {
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
          if (!localOnly) saveMediaSubtitles(subtitleStorageKey, preferences);
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
    const saved = resumeRef.current;
    if (remembered && saved && saved.state !== 'completed' && saved.positionSeconds > 5)
      setSubtitleWindow(Math.floor(Math.max(0, saved.positionSeconds) / 60) * 60);
    if (remembered)
      void handleSubtitleSearch(remembered.language, remembered.hearingImpaired, true);
    else void handleSubtitleSearch(navigator.language.split('-')[0] || 'en', false, true, true);
  }, [session, subtitleStorageKey, handleSubtitleSearch]);

  const handleSubtitleSelect = useCallback(
    (id: string | null) => {
      setSubtitleWindow(Math.floor((videoRef.current?.currentTime ?? 0) / 60) * 60);
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

  const selectedSubtitle = subtitleCandidates.find(
    candidate => candidate.id === selectedSubtitleId
  );
  const subtitleUrl =
    selectedSubtitle && session
      ? `${API_URL.replace(/\/+$/, '')}/api/subtitles/tracks/${encodeURIComponent(selectedSubtitle.id)}?streamingKey=${encodeURIComponent(session.streamingKey)}${selectedSubtitle.provider === 'embedded' ? `&start=${subtitleWindow}` : ''}`
      : null;
  const hasProgress = !!progress.data;
  const selectedAudio = session?.delivery?.audioTracks?.find(
    track => track.index === audioTrackIndex
  );
  const needsSelectedTrack =
    session?.delivery?.mode === 'direct' &&
    audioTrackIndex !== session.delivery.defaultAudioTrackIndex &&
    (!(videoRef.current && 'audioTracks' in videoRef.current) ||
      selectedAudio?.canPlayDirect === false) &&
    !!selectedAudio?.mimeType;
  const [audioRemux, setAudioRemux] = useState(false);
  const audioDelivery =
    session?.delivery?.mode === 'audio-transcode' || needsSelectedTrack || audioRemux
      ? session?.delivery
      : undefined;
  // Converted audio is fed to a <video> element through Media Source Extensions
  const playsInAvplay = !!avplay && !audioDelivery;
  /** The selected subtitle's cues, drawn over AVPlay, which has no `<track>`. */
  const [avplayCues, setAvplayCues] = useState<SubtitleCue[]>([]);

  useEffect(() => {
    setAvplayCues([]);
    if (!playsInAvplay || !subtitleUrl) return;
    const controller = new AbortController();
    fetch(subtitleUrl, { credentials: API_CREDENTIALS, signal: controller.signal })
      .then(async (response: Response) => {
        if (!response.ok) throw new Error(`Subtitle request failed: ${response.status}`);
        const cues = parseVtt(await response.text());
        setAvplayCues(cues);
        setSubtitleCues(cues);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setSubtitleMessage('The selected subtitle could not be loaded.');
      });
    return () => controller.abort();
  }, [playsInAvplay, subtitleUrl]);

  useEffect(() => {
    const video = videoRef.current as
      | (PlayerMedia & {
          audioTracks?: { length: number; [index: number]: { enabled: boolean } };
        })
      | null;
    if (audioDelivery || !video?.audioTracks || audioTrackIndex === undefined) return;
    const select = () => {
      if (!video.audioTracks || !video.audioTracks[audioTrackIndex]) return;
      for (let index = 0; index < video.audioTracks.length; index++)
        video.audioTracks[index].enabled = index === audioTrackIndex;
    };
    select();
    video.addEventListener('loadedmetadata', select);
    return () => video.removeEventListener('loadedmetadata', select);
  }, [session, audioDelivery, audioTrackIndex]);

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
      onError: message => {
        setStatus('error');
        setError(message);
        resetSessionRequest();
      },
    });
  }, [session, audioDelivery, audioSeek, hasProgress, audioTrackIndex, resetSessionRequest]);

  useEffect(() => {
    const track = subtitleTrackRef.current;
    if (!track || !selectedSubtitle) return;
    const failed = () => setSubtitleMessage('The selected subtitle could not be loaded.');
    // Track load/error events do not bubble; subscribe to the native element.
    track.addEventListener('load', handleSubtitleLoaded);
    track.addEventListener('error', failed);
    if (track.readyState === 2) handleSubtitleLoaded();
    const previewTimer = window.setInterval(() => {
      if (track.readyState === 3) window.clearInterval(previewTimer);
      if (track.track.cues?.length) {
        handleSubtitleLoaded();
        window.clearInterval(previewTimer);
      }
    }, 100);
    return () => {
      window.clearInterval(previewTimer);
      track.removeEventListener('load', handleSubtitleLoaded);
      track.removeEventListener('error', failed);
    };
  }, [selectedSubtitle, handleSubtitleLoaded, subtitleWindow]);

  useEffect(() => {
    const track = subtitleTrackRef.current;
    if (!track) return;
    track.track.mode = selectedSubtitle ? 'showing' : 'disabled';
    if (selectedSubtitle) applySubtitleOffset();
  }, [applySubtitleOffset, selectedSubtitle, subtitleOffset, audioSeek, audioTrackIndex]);

  const failSource = useCallback(() => {
    const key = JSON.stringify(playable);
    if (failedSources.current.key !== key) failedSources.current = { key, ids: new Set() };
    const sourceId = sessionRequest.data?.source.id;
    if (sourceId !== undefined && !failedSources.current.ids.has(sourceId)) {
      // The backend records a source that cannot play, so a new session picks the next one.
      failedSources.current.ids.add(sourceId);
      setAttempt(value => value + 1);
      return;
    }
    resetSessionRequest();
    setStatus('error');
    setError(
      `Playback for “${title}” could not load the selected source. Retry to try source preparation again.`
    );
  }, [playable, resetSessionRequest, sessionRequest.data, title]);

  useEffect(() => {
    if (!deliveryUpdate) return;
    if (deliveryUpdate.type === 'recreate') {
      setAttempt(value => value + 1);
      return;
    }
    const { delivery } = deliveryUpdate;
    setAudioTrackIndex(delivery.defaultAudioTrackIndex);
    if (delivery.mode === 'audio-transcode') {
      // Continue from where the optimistic direct stream got to.
      const video = videoRef.current;
      audioPreparing.current = true;
      directFailedWhilePending.current = false;
      setAudioSeek(previous => ({
        position: video?.currentTime ?? 0,
        autoplay: video ? !video.paused || video.autoplay : true,
        revision: previous.revision + 1,
      }));
    } else if (directFailedWhilePending.current) {
      directFailedWhilePending.current = false;
      failSource();
    }
  }, [deliveryUpdate, failSource]);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    directFailedWhilePending.current = false;
    sessionSubtitleStorageKey.current = null;
    const sessionKey = JSON.stringify([playable, attempt]);
    if (sessionInFlight.current?.key !== sessionKey) {
      resetSessionRequest();
      dispatch(realtimeActions.sourceAttemptCleared(playable));
    }
    setError(null);
    setStatus('preparing');
    resumeApplied.current = false;
    completedRef.current = false;
    latestProgress.current = null;

    // Sources this player already failed to play: the backend cannot see a browser rejection.
    const avoidSourceIds =
      failedSources.current.key === JSON.stringify(playable) ? [...failedSources.current.ids] : [];
    if (sessionInFlight.current?.key !== sessionKey)
      sessionInFlight.current = {
        key: sessionKey,
        promise: createSession({
          playable,
          ...(avoidSourceIds.length ? { avoidSourceIds } : {}),
          preferences: playbackPreferences(!!avplay),
        }).unwrap(),
      };
    void sessionInFlight.current.promise
      .then(result => {
        if (currentRequest !== requestId.current) return;
        const failed = failedSources.current;
        if (failed.key === JSON.stringify(playable) && failed.ids.has(result.source.id)) {
          // Nothing new to try: the only sources left already failed here.
          resetSessionRequest();
          setStatus('error');
          setError(
            `Playback for “${title}” could not load any of its sources. Retry to try source preparation again.`
          );
          return;
        }
        setStatus(result.preparation.state === 'warm' ? 'ready' : 'preparing');
        setAudioSeek({ position: 0, autoplay: true, revision: 0 });
        setPendingPosition(undefined);
        setAudioRemux(false);
        setAudioTrackIndex(result.delivery?.defaultAudioTrackIndex);
        audioPreparing.current = result.delivery?.mode === 'audio-transcode';
        sessionSubtitleStorageKey.current = subtitleStorageKey;
      })
      .catch((reason: unknown) => {
        if (currentRequest !== requestId.current) return;
        if (isUnavailablePlaybackFailure(reason) && avoidSourceIds.length) {
          // Only sources that already failed here are left.
          setStatus('error');
          setError(
            `Playback for “${title}” could not load any of its sources. Retry to try source preparation again.`
          );
          return;
        }
        if (isUnavailablePlaybackFailure(reason)) {
          // No source exists, or every one proved fake: offer to notify once one is out.
          setStatus('exhausted');
          return;
        }
        setStatus('error');
        setError(describePlaybackFailure(reason, title));
      });

    return () => {
      requestId.current += 1;
      const cleanupRequest = requestId.current;
      const snapshot = readProgressSnapshot();
      const completed = completedRef.current;
      queueMicrotask(() => {
        // StrictMode immediately sets up the same target again. A real target change
        // still saves the old target's snapshot before its refs are reused.
        if (
          snapshot &&
          !completed &&
          (requestId.current === cleanupRequest || sessionInFlight.current?.key !== sessionKey)
        ) {
          void dispatch(saveProgressWithRealtime({ playable, ...snapshot, state: 'paused' }));
        }
      });
    };
  }, [
    attempt,
    avplay,
    createSession,
    playable,
    resetSessionRequest,
    saveProgress,
    readProgressSnapshot,
    dispatch,
    subtitleStorageKey,
    title,
  ]);

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

  const mediaEvents: Required<PlayerMediaEvents> = {
    onLoadedMetadata: (event: { currentTarget: PlayerMedia }) => {
      if (audioDelivery) return;
      if (!resumeApplied.current && progress.data) {
        resumeApplied.current = true;
        if (resume && resume.state !== 'completed' && resume.positionSeconds > 5) {
          event.currentTarget.currentTime = Math.min(
            (resume.positionSeconds / resume.durationSeconds) * event.currentTarget.duration,
            Math.max(0, event.currentTarget.duration - 1)
          );
        }
      }
      readProgressSnapshot();
    },
    onSeeked: (event: { currentTarget: PlayerMedia }) => {
      if (audioPreparing.current) return;
      const creditsStart = session?.delivery?.creditsStartSeconds;
      suppressCreditAfterSeek.current =
        creditsStart !== undefined && event.currentTarget.currentTime >= creditsStart;
      setSubtitleWindow(
        Math.floor(Math.max(0, event.currentTarget.currentTime - subtitleOffsetRef.current) / 60) *
          60
      );
      updateNextCountdown();
    },
    onTimeUpdate: (event: { currentTarget: PlayerMedia }) => {
      if (audioPreparing.current) return;
      const duration = session?.delivery?.durationSeconds ?? event.currentTarget.duration;
      if (
        nextEpisode &&
        Number.isFinite(duration) &&
        duration > 0 &&
        event.currentTarget.currentTime / duration >= 0.7
      ) {
        if (!nextSearchReached) setNextSearchReached(true);
        void prepareNextEpisode(true);
        startNextEpisodeDownload();
      }
      setSubtitleWindow(
        Math.floor(Math.max(0, event.currentTarget.currentTime - subtitleOffsetRef.current) / 60) *
          60
      );
      readProgressSnapshot();
      updateNextCountdown();
    },
    onCanPlay: () => {
      if (!audioPreparing.current) setStatus('ready');
    },
    onPlaying: () => {
      if (!audioPreparing.current) {
        setStatus('ready');
        saveProgress('playing');
      }
    },
    onPause: () => {
      if (!audioPreparing.current && !completedRef.current) saveProgress('paused');
    },
    onEnded: () => {
      completedRef.current = true;
      saveProgress('completed');
      updateNextCountdown();
    },
    onError: () => {
      // The browser may reject an unprobed file whose audio needs transcoding;
      // the pending delivery decides whether that is a real failure.
      if (session?.deliveryPending) {
        directFailedWhilePending.current = true;
        return;
      }
      failSource();
    },
  };

  const navigationRef = useKeyboardNavigation({
    onBack: () => {
      onBack();
      return true;
    },
  });
  const pageRef = useRef<HTMLElement | null>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const notifyRef = useRef<HTMLButtonElement>(null);
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
  // A remote needs something focused: the failure's action, else the player (for Back)
  useEffect(() => {
    if (!error && status !== 'exhausted') return;
    (retryRef.current ?? notifyRef.current ?? pageRef.current)?.focus({ preventScroll: true });
  }, [error, status, availabilityRequest.isSuccess]);

  const sourceAttempt = pushedAttempt ?? session?.sourceAttempt ?? null;
  const statusMessage =
    sourceAttempt && (status === 'checking' || status === 'preparing')
      ? getSourceAttemptMessage(sourceAttempt, title)
      : getPlaybackStatusMessage(status, title);

  return (
    <Page ref={setPage} tabIndex={-1} aria-label="Player">
      {!session && <PlayerHeader onBack={onBack} />}
      {session ? (
        <>
          {avplay && playsInAvplay ? (
            <AvplayVideo
              avplay={avplay}
              mediaRef={setMedia}
              src={session.streamUrl}
              aria-label={title}
              autoPlay
              subtitleCues={selectedSubtitle ? avplayCues : []}
              subtitleOffset={subtitleOffset}
              {...mediaEvents}
            />
          ) : (
            <Video
              ref={setMedia}
              src={audioDelivery ? undefined : session.streamUrl}
              // The TV app's backend is cross-origin, and subtitle tracks only load across origins with CORS
              crossOrigin={builtForTizen ? 'anonymous' : undefined}
              aria-label={title}
              autoPlay={!audioDelivery}
              playsInline
              {...mediaEvents}
            >
              {selectedSubtitle && subtitleUrl && (
                <track
                  key={`${selectedSubtitle.id}:${selectedSubtitle.provider === 'embedded' ? subtitleWindow : 0}`}
                  ref={node => {
                    subtitleTrackRef.current = node;
                    if (node) node.track.mode = 'showing';
                  }}
                  kind="subtitles"
                  srcLang={selectedSubtitle.language}
                  label={`${selectedSubtitle.languageLabel}${selectedSubtitle.hearingImpaired ? ' (SDH)' : ''}`}
                  src={subtitleUrl}
                  default
                />
              )}
            </Video>
          )}
          {nextEpisode && nextCountdown !== null && (
            <NextEpisodePrompt role="group" aria-label="Next episode">
              <NextEpisodeButton type="button" onClick={playNextEpisode}>
                Play next episode ({nextCountdown}s)
              </NextEpisodeButton>
              <BackButton
                type="button"
                onClick={() => {
                  nextDismissed.current = nextEpisodeKey;
                  setNextCountdown(null);
                }}
              >
                Stay
              </BackButton>
            </NextEpisodePrompt>
          )}
          <PlayerControls
            // The controls listen to one media element; a switch to converted audio replaces it
            key={playsInAvplay ? 'avplay' : 'video'}
            videoRef={videoRef}
            preparing={status !== 'ready'}
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
            audioTracks={session?.delivery?.audioTracks?.filter(
              track =>
                session.delivery?.mode === 'audio-transcode' ||
                track.index === session.delivery?.defaultAudioTrackIndex ||
                !!track.mimeType ||
                (videoRef.current && 'audioTracks' in videoRef.current && track.canPlayDirect)
            )}
            selectedAudioTrackIndex={audioTrackIndex}
            onSelectAudioTrack={index => {
              if (index === audioTrackIndex) return;
              const position = pendingPosition ?? videoRef.current?.currentTime ?? 0;
              const autoplay = audioPreparing.current
                ? audioSeek.autoplay
                : !videoRef.current?.paused;
              resumeApplied.current = true;
              const nativeSelection =
                session.delivery?.mode === 'direct' &&
                !audioRemux &&
                videoRef.current &&
                'audioTracks' in videoRef.current &&
                session.delivery.audioTracks?.find(track => track.index === index)
                  ?.canPlayDirect !== false;
              audioPreparing.current = !nativeSelection;
              if (!nativeSelection) {
                setAudioRemux(true);
                setPendingPosition(position);
              }
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
            <RetryButton
              ref={retryRef}
              type="button"
              onClick={() => {
                failedSources.current = { key: '', ids: new Set() };
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
