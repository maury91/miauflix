import type { PlayerMedia } from '@features/player/lib/avplay-media';
import { progressForPlayable, useGetProgressQuery } from '@features/progress/api/progress.api';
import { saveProgressWithRealtime } from '@features/realtime/realtime.middleware';
import type { PlayableRef, PlaybackDelivery, ProgressRequest } from '@miauflix/backend';
import type { AppDispatch } from '@store/store';
import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';

/**
 * The saved progress of a target, and whether playback already moved to it (or chose not to).
 * Kept apart from `usePlaybackProgress` because converted audio resumes on its own.
 */
export function useResumePoint(playable: PlayableRef) {
  const progress = useGetProgressQuery(undefined);
  const resume = progress.data ? progressForPlayable(progress.data.progress, playable) : undefined;
  const resumeRef = useRef(resume);
  resumeRef.current = resume;
  const resumeApplied = useRef(false);
  return {
    resume,
    /** `resume` as of the latest render, for effects that must not rerun when it changes. */
    resumeRef,
    /** The saved progress has loaded (it may hold nothing for this target). */
    hasProgress: !!progress.data,
    /** The saved progress has loaded or failed to: waiting for it longer is pointless. */
    progressSettled: !progress.isLoading,
    resumeApplied,
  };
}

export type ResumePoint = ReturnType<typeof useResumePoint>;

/** The resume position scaled to this file's duration, one second short of its end. */
export function resumePosition(
  saved: { positionSeconds: number; durationSeconds: number },
  duration: number
): number {
  return Math.min(
    (saved.positionSeconds / saved.durationSeconds) * duration,
    Math.max(0, duration - 1)
  );
}

interface PlaybackProgressOptions {
  playable: PlayableRef;
  videoRef: RefObject<PlayerMedia | null>;
  /** Converted audio is (re)starting: the element's time is not the playback position. */
  audioPreparing: RefObject<boolean>;
  delivery: PlaybackDelivery | undefined;
  /** Set while audio is converted: it resumes itself, so the element is not seeked here. */
  audioDelivery: PlaybackDelivery | undefined;
  resume: ResumePoint;
}

/**
 * Report progress while playing (every ten seconds), on pause, on completion, and when the
 * target is left; resume unfinished progress beyond five seconds by its fraction of the
 * saved duration.
 */
export function usePlaybackProgress({
  playable,
  videoRef,
  audioPreparing,
  delivery,
  audioDelivery,
  resume: { resume, hasProgress, resumeApplied },
}: PlaybackProgressOptions) {
  const dispatch = useDispatch<AppDispatch>();
  const deliveryRef = useRef(delivery);
  deliveryRef.current = delivery;
  const latestProgress = useRef<{
    positionSeconds: number;
    durationSeconds: number;
  } | null>(null);
  const completedRef = useRef(false);
  /** Removes a resume still waiting for a usable duration (see handleLoadedMetadata). */
  const cancelPendingResume = useRef<(() => void) | null>(null);

  const readProgressSnapshot = useCallback(() => {
    if (audioPreparing.current) return latestProgress.current;
    const video = videoRef.current;
    // A remux still being built lists only its finished segments: its own duration grows.
    const duration =
      deliveryRef.current?.mode === 'audio-transcode' || deliveryRef.current?.mode === 'remux'
        ? deliveryRef.current.durationSeconds
        : video?.duration;
    if (video && duration !== undefined && Number.isFinite(duration) && duration > 0) {
      latestProgress.current = {
        positionSeconds: Math.min(Math.max(video.currentTime, 0), duration),
        durationSeconds: duration,
      };
    }
    return latestProgress.current;
  }, [audioPreparing, videoRef]);

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

  /** A new session request starts: nothing is resumed, reported or completed yet. */
  const resetForRequest = useCallback(() => {
    cancelPendingResume.current?.();
    cancelPendingResume.current = null;
    resumeApplied.current = false;
    completedRef.current = false;
    latestProgress.current = null;
  }, [resumeApplied]);

  /** Snapshot the target being left; the returned save reports it as paused. */
  const captureLeave = useCallback(
    (target: PlayableRef) => {
      const snapshot = readProgressSnapshot();
      if (!snapshot || completedRef.current) return null;
      return () =>
        void dispatch(saveProgressWithRealtime({ playable: target, ...snapshot, state: 'paused' }));
    },
    [dispatch, readProgressSnapshot]
  );

  /** Mark the target finished, once; skipping the credits finishes it before `ended` fires. */
  const completeOnce = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    saveProgress('completed');
  }, [saveProgress]);

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
  }, [audioPreparing, saveProgress, videoRef]);

  /**
   * Seek `media` to the saved position now, or, while its duration is still unknown (NaN) or
   * unbounded (Infinity), at the first usable `durationchange`. A new request cancels the wait.
   */
  const resumeWhenDurationKnown = useCallback(
    (media: PlayerMedia, saved: Parameters<typeof resumePosition>[0]) => {
      const applyResume = () => {
        if (resumeApplied.current) return true;
        if (!Number.isFinite(media.duration) || media.duration <= 0) return false;
        resumeApplied.current = true;
        media.currentTime = resumePosition(saved, media.duration);
        return true;
      };
      cancelPendingResume.current?.();
      cancelPendingResume.current = null;
      if (applyResume()) return;
      const stop = () => media.removeEventListener('durationchange', onDurationChange);
      const onDurationChange = () => {
        if (!applyResume()) return;
        stop();
        cancelPendingResume.current = null;
      };
      media.addEventListener('durationchange', onDurationChange);
      cancelPendingResume.current = stop;
    },
    [resumeApplied]
  );

  // Progress that loads after `loadedmetadata` resumes here.
  useEffect(() => {
    const video = videoRef.current;
    if (audioDelivery || !video || resumeApplied.current || !resume || resume.state === 'completed')
      return;
    if (resume.positionSeconds <= 5) return;
    resumeWhenDurationKnown(video, resume);
  }, [resume, audioDelivery, resumeApplied, videoRef, resumeWhenDurationKnown]);

  return {
    readProgressSnapshot,
    saveProgress,
    resetForRequest,
    captureLeave,
    completeOnce,
    /** Media `loadedmetadata`: resume a direct stream once the saved progress is known. */
    handleLoadedMetadata(media: PlayerMedia) {
      if (audioDelivery) return;
      if (!resumeApplied.current && hasProgress) {
        if (!resume || resume.state === 'completed' || resume.positionSeconds <= 5) {
          resumeApplied.current = true;
        } else {
          resumeWhenDurationKnown(media, resume);
        }
      }
      readProgressSnapshot();
    },
    handlePlaying() {
      saveProgress('playing');
    },
    handlePause() {
      if (!audioPreparing.current && !completedRef.current) saveProgress('paused');
    },
    handleEnded() {
      completedRef.current = true;
      saveProgress('completed');
    },
  };
}
