import { useSearchSubtitlesMutation } from '@features/player/api/playback.api';
import { assRendererSupported, useAssSubtitles } from '@features/player/lib/ass-subtitles';
import type { PlayerMedia } from '@features/player/lib/avplay-media';
import {
  type MediaSubtitles,
  readMediaSubtitles,
  saveMediaSubtitles,
} from '@features/player/lib/media-subtitles';
import { useSubtitleFont } from '@features/player/lib/subtitle-font';
import { parseVtt, type SubtitleCue } from '@features/player/lib/vtt';
import type { SubtitleCandidateDto } from '@miauflix/backend';
import type { SubtitleTimingCue } from '@pages/home/components/SubtitleTiming';
import { API_CREDENTIALS, API_URL } from '@shared/config/constants';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ResumePoint } from './usePlaybackProgress';
import type { PlaybackSource } from './usePlaybackSource';

/** The start of the minute holding `seconds`: embedded tracks are served a window at a time. */
function minuteWindow(seconds: number): number {
  return Math.floor(Math.max(0, seconds) / 60) * 60;
}

function cueText(cue: TextTrackCue): string {
  const vttCue = cue as VTTCue;
  return typeof vttCue.getCueAsHTML === 'function'
    ? (vttCue.getCueAsHTML().textContent ?? '')
    : (vttCue.text ?? '');
}

interface SubtitlesOptions {
  session: PlaybackSource['session'];
  /** Where this user's subtitle choice for this target is remembered. */
  storageKey: string;
  /** The storage key the current session was created for; null while one is requested. */
  sessionStorageKey: RefObject<string | null>;
  videoRef: RefObject<PlayerMedia | null>;
  /** The same element as `videoRef`, for the styled (ASS) renderer that attaches to it. */
  mediaElement: PlayerMedia | null;
  resumeRef: ResumePoint['resumeRef'];
  /** AVPlay has no `<track>`: the cues are fetched and drawn over it instead. */
  playsInAvplay: boolean;
  /** A converted-audio restart or track switch, after which the track is set up again. */
  audioSeek: unknown;
  audioTrackIndex: number | undefined;
}

/**
 * Subtitle search, choice and timing for the current session: restores the remembered choice
 * (or searches locally in the browser's language), loads the chosen track as WebVTT, as styled
 * ASS, or as cues for AVPlay, and keeps the remembered choice and offset up to date.
 */
export function useSubtitles({
  session,
  storageKey,
  sessionStorageKey,
  videoRef,
  mediaElement,
  resumeRef,
  playsInAvplay,
  audioSeek,
  audioTrackIndex,
}: SubtitlesOptions) {
  const [searchSubtitles] = useSearchSubtitlesMutation();
  const rememberedSubtitles = useRef<MediaSubtitles | null>(readMediaSubtitles(storageKey));
  const [searchPreferences, setSearchPreferences] = useState<
    { language: string; hearingImpaired: boolean } | undefined
  >();
  const [candidates, setCandidates] = useState<SubtitleCandidateDto[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [subtitleWindow, setSubtitleWindow] = useState(0);
  const [cues, setCues] = useState<SubtitleTimingCue[]>([]);
  /** The native track's current line, drawn by `SubtitleCaption` rather than the browser. */
  const [nativeCaption, setNativeCaption] = useState('');
  /** Pixels the open player controls cover at the bottom; captions sit above them. */
  const [controlsInset, setControlsInset] = useState(0);
  /** Pixels the open header covers at the top; styled subtitles are drawn below it. */
  const [headerInset, setHeaderInset] = useState(0);
  const insets = useMemo(
    () => ({ top: headerInset, bottom: controlsInset }),
    [headerInset, controlsInset]
  );
  const trackRef = useRef<HTMLTrackElement | null>(null);
  const requestId = useRef(0);
  const currentStreamingKey = useRef<string | null>(null);
  const cueTimes = useRef(new WeakMap<TextTrackCue, { start: number; end: number }>());
  const offsetRef = useRef(0);
  currentStreamingKey.current = session?.streamingKey ?? null;
  offsetRef.current = offset;

  useEffect(() => {
    requestId.current += 1;
    setCandidates([]);
    setConfigured(null);
    setAvailable(null);
    setLoading(false);
    setMessage('');
    setSelectedId(null);
    setCues([]);
    setOffset(0);
    cueTimes.current = new WeakMap();
    return () => {
      requestId.current += 1;
    };
  }, [session?.streamingKey]);

  const applyOffset = useCallback(() => {
    const trackCues = trackRef.current?.track.cues;
    if (!trackCues) return;
    for (const cue of trackCues) {
      let original = cueTimes.current.get(cue);
      if (!original) {
        original = { start: cue.startTime, end: cue.endTime };
        cueTimes.current.set(cue, original);
      }
      const current = offsetRef.current;
      cue.startTime = Math.max(0, original.start + current);
      cue.endTime = Math.max(cue.startTime + 0.01, original.end + current);
    }
  }, []);

  useEffect(() => {
    setSubtitleWindow(minuteWindow((videoRef.current?.currentTime ?? 0) - offset));
  }, [offset, videoRef]);

  const syncNativeCaption = useCallback(() => {
    const active = trackRef.current?.track.activeCues;
    setNativeCaption(active ? Array.from(active).map(cueText).filter(Boolean).join('\n') : '');
  }, []);

  const handleTrackLoaded = useCallback(() => {
    const trackCues = trackRef.current?.track.cues;
    if (trackCues)
      setCues(
        Array.from(trackCues).map(cue => {
          const original = cueTimes.current.get(cue) ?? { start: cue.startTime, end: cue.endTime };
          return { ...original, text: cueText(cue) };
        })
      );
    applyOffset();
  }, [applyOffset]);

  const search = useCallback(
    async (language: string, hearingImpaired: boolean, restoring = false, localOnly = false) => {
      if (!session || sessionStorageKey.current !== storageKey) return;
      const request = ++requestId.current;
      const streamingKey = session.streamingKey;
      setLoading(true);
      setMessage('');
      setSelectedId(null);
      setCues([]);
      setOffset(0);
      setSearchPreferences({ language, hearingImpaired });
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
        if (requestId.current !== request || currentStreamingKey.current !== streamingKey) return;
        setCandidates(result.candidates);
        setConfigured(result.configured);
        setAvailable(result.available);
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
          if (!localOnly) saveMediaSubtitles(storageKey, preferences);
          setSelectedId(selected?.id ?? null);
          setOffset(preferences.offset);
        }
        setMessage(
          result.configured && result.available && result.candidates.length === 0
            ? 'No subtitles found for this language.'
            : ''
        );
      } catch {
        if (requestId.current === request && currentStreamingKey.current === streamingKey) {
          setAvailable(false);
          setMessage('Subtitle search failed. Playback can continue.');
        }
      } finally {
        if (requestId.current === request) setLoading(false);
      }
    },
    [searchSubtitles, session, sessionStorageKey, storageKey]
  );

  useEffect(() => {
    if (!session || sessionStorageKey.current !== storageKey) return;
    rememberedSubtitles.current = readMediaSubtitles(storageKey);
    const remembered = rememberedSubtitles.current;
    const saved = resumeRef.current;
    if (remembered && saved && saved.state !== 'completed' && saved.positionSeconds > 5)
      setSubtitleWindow(minuteWindow(saved.positionSeconds));
    if (remembered) void search(remembered.language, remembered.hearingImpaired, true);
    else void search(navigator.language.split('-')[0] || 'en', false, true, true);
  }, [session, storageKey, search, sessionStorageKey, resumeRef]);

  const select = useCallback(
    (id: string | null) => {
      setSubtitleWindow(Math.floor((videoRef.current?.currentTime ?? 0) / 60) * 60);
      setSelectedId(id);
      setCues([]);
      setOffset(0);
      setMessage('');
      cueTimes.current = new WeakMap();
      const remembered = rememberedSubtitles.current;
      if (remembered) {
        const next = {
          ...remembered,
          selectedFileId: candidates.find(candidate => candidate.id === id)?.fileId ?? null,
          offset: 0,
        };
        rememberedSubtitles.current = next;
        saveMediaSubtitles(storageKey, next);
      }
    },
    [candidates, storageKey, videoRef]
  );

  const changeOffset = useCallback(
    (value: number) => {
      setOffset(value);
      const remembered = rememberedSubtitles.current;
      if (remembered) {
        const next = { ...remembered, offset: value };
        rememberedSubtitles.current = next;
        saveMediaSubtitles(storageKey, next);
      }
    },
    [storageKey]
  );

  const selected = candidates.find(candidate => candidate.id === selectedId);
  const trackUrl = selected
    ? `${API_URL.replace(/\/+$/, '')}/api/subtitles/tracks/${encodeURIComponent(selected.id)}`
    : null;
  /** A styled track whose renderer failed falls back to WebVTT captions. */
  const [assFailedId, setAssFailedId] = useState<string | null>(null);
  const usesAss =
    !!selected?.styled &&
    assFailedId !== selected.id &&
    mediaElement instanceof HTMLVideoElement &&
    assRendererSupported();
  const handleAssCues = useCallback((assCues: SubtitleTimingCue[]) => setCues(assCues), []);
  const handleAssError = useCallback(() => {
    setAssFailedId(selectedId);
    setCues([]);
  }, [selectedId]);
  useAssSubtitles({
    video: usesAss ? (mediaElement as HTMLVideoElement) : null,
    trackUrl: usesAss ? trackUrl : null,
    streamingKey: session?.streamingKey ?? '',
    windowed: selected?.provider === 'embedded',
    windowStart: subtitleWindow,
    offset,
    insets,
    onCues: handleAssCues,
    onError: handleAssError,
  });
  const url =
    selected && session && !usesAss
      ? `${trackUrl}?streamingKey=${encodeURIComponent(session.streamingKey)}${selected.provider === 'embedded' ? `&start=${subtitleWindow}` : ''}`
      : null;
  const fontFamily = useSubtitleFont(
    selected?.embeddedFonts && session && !usesAss
      ? `${API_URL.replace(/\/+$/, '')}/api/subtitles/tracks/${encodeURIComponent(selected.id)}/font?streamingKey=${encodeURIComponent(session.streamingKey)}`
      : null
  );

  /** The selected subtitle's cues, drawn over AVPlay, which has no `<track>`. */
  const [avplayCues, setAvplayCues] = useState<SubtitleCue[]>([]);

  useEffect(() => {
    setAvplayCues([]);
    if (!playsInAvplay || !url) return;
    const controller = new AbortController();
    fetch(url, { credentials: API_CREDENTIALS, signal: controller.signal })
      .then(async (response: Response) => {
        if (!response.ok) throw new Error(`Subtitle request failed: ${response.status}`);
        const parsed = parseVtt(await response.text());
        setAvplayCues(parsed);
        setCues(parsed);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage('The selected subtitle could not be loaded.');
      });
    return () => controller.abort();
  }, [playsInAvplay, url]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !selected) return;
    const failed = () => setMessage('The selected subtitle could not be loaded.');
    // Track load/error events do not bubble; subscribe to the native element.
    track.addEventListener('load', handleTrackLoaded);
    track.addEventListener('error', failed);
    const textTrack = track.track;
    textTrack.addEventListener?.('cuechange', syncNativeCaption);
    if (track.readyState === 2) handleTrackLoaded();
    const previewTimer = window.setInterval(() => {
      if (track.readyState === 3) window.clearInterval(previewTimer);
      if (track.track.cues?.length) {
        handleTrackLoaded();
        window.clearInterval(previewTimer);
      }
    }, 100);
    return () => {
      window.clearInterval(previewTimer);
      track.removeEventListener('load', handleTrackLoaded);
      track.removeEventListener('error', failed);
      textTrack.removeEventListener?.('cuechange', syncNativeCaption);
      setNativeCaption('');
    };
  }, [selected, handleTrackLoaded, syncNativeCaption, subtitleWindow]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    // Hidden still tracks the active cues; the player draws them itself
    track.track.mode = selected ? 'hidden' : 'disabled';
    if (selected) applyOffset();
    syncNativeCaption();
  }, [applyOffset, syncNativeCaption, selected, offset, audioSeek, audioTrackIndex]);

  /** Follow the playhead (on seek and time updates) so embedded tracks load the right window. */
  const followPlayhead = useCallback((currentTime: number) => {
    setSubtitleWindow(minuteWindow(currentTime - offsetRef.current));
  }, []);

  return {
    searchPreferences,
    candidates,
    configured,
    available,
    loading,
    message,
    selectedId,
    selected,
    offset,
    cues,
    subtitleWindow,
    /** The `<track>` URL for the chosen subtitle, unless it is drawn as styled ASS. */
    url,
    fontFamily,
    nativeCaption,
    avplayCues,
    controlsInset,
    setControlsInset,
    setHeaderInset,
    trackRef,
    search,
    select,
    changeOffset,
    followPlayhead,
  };
}
