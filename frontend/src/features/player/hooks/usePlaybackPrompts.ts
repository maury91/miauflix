import { useCreateSessionMutation } from '@features/player/api/playback.api';
import type { PlayerMedia } from '@features/player/lib/avplay-media';
import { backendUrl, playbackPreferences } from '@features/player/lib/playback-request';
import type { CreatePlaybackSessionResponse, PlayableRef } from '@miauflix/backend';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

import type { PlaybackSource } from './usePlaybackSource';

export interface NextEpisode {
  playable: PlayableRef;
  title: string;
}

/** Identifies the next target, so per-target state resets when it changes. */
export function nextEpisodeKeyOf(nextEpisode: NextEpisode | null): string | null {
  if (!nextEpisode) return null;
  const { playable } = nextEpisode;
  return playable.kind === 'movie'
    ? `m:${playable.mediaId}`
    : `e:${playable.showMediaId}:${playable.seasonNumber}:${playable.episodeNumber}`;
}

interface PlaybackPromptsOptions {
  playable: PlayableRef;
  nextEpisode: NextEpisode | null;
  session: PlaybackSource['session'];
  /** The player decodes through Samsung's AVPlay. */
  avplay: boolean;
  videoRef: RefObject<PlayerMedia | null>;
  /** Seek, restarting converted audio when needed. */
  seekTo: (position: number) => void;
  /** Mark the current target finished, once. */
  completeOnce: () => void;
  onPlayNext: () => void;
}

/**
 * The prompts over the end and start of an episode: "Skip intro" while the opening plays,
 * "Skip credits" with a countdown when a scene follows them, and "Play next episode" with a
 * countdown near the end. The next episode's session is prepared ahead (and retried once at
 * 70%), and its download starts from 70%, so it plays without a wait.
 */
export function usePlaybackPrompts({
  playable,
  nextEpisode,
  session,
  avplay,
  videoRef,
  seekTo,
  completeOnce,
  onPlayNext,
}: PlaybackPromptsOptions) {
  const [createNextSession] = useCreateSessionMutation();
  const [prefetchedNextSession, setPrefetchedNextSession] =
    useState<CreatePlaybackSessionResponse | null>(null);
  const prefetchedNextRef = useRef<CreatePlaybackSessionResponse | null>(null);
  const nextRequestInFlight = useRef<Promise<void> | null>(null);
  /** The next episode that already got its one retry at the 70% prefetch point. */
  const nextRetriedAtPrefetch = useRef<string | null>(null);
  const nextDownloadStarted = useRef<string | null>(null);
  const [nextSearchReached, setNextSearchReached] = useState(false);
  const nextDismissed = useRef<string | null>(null);
  const nextTransitioned = useRef<string | null>(null);
  const suppressCreditAfterSeek = useRef(false);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  /** Seconds before the credits are skipped to the scene after them; null while not offered. */
  const [skipCountdown, setSkipCountdown] = useState<number | null>(null);
  const skipDismissed = useRef(false);
  const [inIntro, setInIntro] = useState(false);
  const nextEpisodeKey = nextEpisodeKeyOf(nextEpisode);
  const nextEpisodeRef = useRef(nextEpisode);
  nextEpisodeRef.current = nextEpisode;
  const nextEpisodeKeyRef = useRef(nextEpisodeKey);
  nextEpisodeKeyRef.current = nextEpisodeKey;

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
        preferences: playbackPreferences(avplay),
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

  const playNextEpisode = useCallback(() => {
    if (!nextEpisodeKey || nextTransitioned.current === nextEpisodeKey) return;
    nextTransitioned.current = nextEpisodeKey;
    setNextCountdown(null);
    // Skipping the credits still finishes this episode; onEnded may never fire.
    completeOnce();
    onPlayNext();
  }, [nextEpisodeKey, onPlayNext, completeOnce]);

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
      session.delivery?.creditsEndSeconds === undefined &&
      Number.isFinite(creditsStart) &&
      creditsStart > 0 &&
      creditsStart < duration;
    let remaining: number | null = null;
    if (hasCreditsMarker) {
      if (video.currentTime >= creditsStart!) remaining = 5 - (video.currentTime - creditsStart!);
    } else {
      // With a scene after the credits, the countdown waits for it instead of covering the credits.
      const creditsEnd = session.delivery?.creditsEndSeconds;
      const threshold = Math.max(
        duration <= 90 ? 0 : duration - 90,
        creditsEnd !== undefined && Number.isFinite(creditsEnd) && creditsEnd < duration
          ? creditsEnd
          : 0
      );
      if (video.currentTime >= threshold) remaining = duration - video.currentTime;
    }
    if (remaining === null) {
      setNextCountdown(null);
      return;
    }
    const seconds = Math.max(0, Math.ceil(remaining));
    setNextCountdown(seconds);
    if (remaining <= 0) playNextEpisode();
  }, [nextEpisodeKey, playNextEpisode, session, videoRef]);

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
    skipDismissed.current = false;
    setSkipCountdown(null);
    setInIntro(false);
  }, [playable, nextEpisodeKey]);

  useEffect(() => {
    if (session?.streamingKey && nextEpisodeKey) void prepareNextEpisode();
  }, [session?.streamingKey, nextEpisodeKey, prepareNextEpisode]);

  useEffect(() => {
    if (nextSearchReached && prefetchedNextSession) startNextEpisodeDownload();
  }, [nextSearchReached, prefetchedNextSession, startNextEpisodeDownload]);

  const skipCredits = useCallback(() => {
    const creditsEnd = session?.delivery?.creditsEndSeconds;
    setSkipCountdown(null);
    if (creditsEnd === undefined) return;
    skipDismissed.current = true;
    seekTo(creditsEnd);
  }, [seekTo, session]);

  const skipIntro = useCallback(() => {
    const introEnd = session?.delivery?.introEndSeconds;
    setInIntro(false);
    if (introEnd !== undefined) seekTo(introEnd);
  }, [seekTo, session]);

  /** Show "Skip intro" while the opening plays. */
  const updateIntroSkip = useCallback(() => {
    const video = videoRef.current;
    const start = session?.delivery?.introStartSeconds;
    const end = session?.delivery?.introEndSeconds;
    setInIntro(
      !!video &&
        start !== undefined &&
        end !== undefined &&
        video.currentTime >= start &&
        // The last second is not worth a skip.
        video.currentTime < end - 1
    );
  }, [session, videoRef]);

  /** Offer to skip credits that a scene follows, and skip them after a short countdown. */
  const updateCreditsSkip = useCallback(() => {
    const video = videoRef.current;
    const creditsStart = session?.delivery?.creditsStartSeconds;
    const creditsEnd = session?.delivery?.creditsEndSeconds;
    if (
      !video ||
      creditsStart === undefined ||
      creditsEnd === undefined ||
      skipDismissed.current ||
      suppressCreditAfterSeek.current ||
      video.currentTime < creditsStart ||
      video.currentTime >= creditsEnd
    ) {
      setSkipCountdown(null);
      return;
    }
    const remaining = 5 - (video.currentTime - creditsStart);
    if (remaining <= 0) skipCredits();
    else setSkipCountdown(Math.ceil(remaining));
  }, [session, skipCredits, videoRef]);

  return {
    inIntro,
    skipCountdown,
    /** Seconds before the next episode plays; null while not offered. */
    nextCountdown,
    skipIntro,
    skipCredits,
    /** Keep watching the credits: the skip is not offered again until a seek before them. */
    watchCredits() {
      skipDismissed.current = true;
      setSkipCountdown(null);
    },
    playNextEpisode,
    /** Stay on this episode: the next one is not offered again for it. */
    stay() {
      nextDismissed.current = nextEpisodeKey;
      setNextCountdown(null);
    },
    updateNextCountdown,
    /** Re-evaluate every prompt against the playhead. */
    updatePrompts() {
      updateNextCountdown();
      updateCreditsSkip();
      updateIntroSkip();
    },
    /** A seek into the credits keeps the countdowns away; one before them offers the skip again. */
    handleSeeked(currentTime: number) {
      const creditsStart = session?.delivery?.creditsStartSeconds;
      suppressCreditAfterSeek.current = creditsStart !== undefined && currentTime >= creditsStart;
      if (creditsStart !== undefined && currentTime < creditsStart) skipDismissed.current = false;
    },
    /** Past 70% of the episode, prepare the next one and start its download. */
    handleTimeUpdate(media: PlayerMedia) {
      const duration = session?.delivery?.durationSeconds ?? media.duration;
      if (
        nextEpisode &&
        Number.isFinite(duration) &&
        duration > 0 &&
        media.currentTime / duration >= 0.7
      ) {
        if (!nextSearchReached) setNextSearchReached(true);
        void prepareNextEpisode(true);
        startNextEpisodeDownload();
      }
    },
  };
}
