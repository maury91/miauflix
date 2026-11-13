import { useCreateSessionMutation } from '@features/player/api/playback.api';
import {
  describePlaybackFailure,
  isUnavailablePlaybackFailure,
  type PlaybackStatus,
} from '@features/player/lib/playback-copy';
import { backendUrl, playbackPreferences } from '@features/player/lib/playback-request';
import type { CreatePlaybackSessionResponse, PlayableRef } from '@miauflix/backend';
import {
  realtimeActions,
  selectPlaybackDelivery,
  selectPlaybackPieces,
  selectSourceAttempt,
} from '@store/slices/realtime';
import type { AppDispatch } from '@store/store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

/**
 * What the rest of the player does as the session request moves along. Read when the request
 * effect runs, so the handlers can come from hooks that are called after this one; they are
 * expected to keep their identity, like the state setters and refs they replace.
 */
export interface PlaybackSessionHandlers {
  /** A session request starts for the current target. */
  onRequestStart(): void;
  /** The current target's session arrived, on a source that has not failed here. */
  onSessionCreated(session: CreatePlaybackSessionResponse): void;
  /** The target is being left: returns what to run if that turns out to be a real change. */
  onTargetLeave(target: PlayableRef): (() => void) | null;
}

const noHandlers: PlaybackSessionHandlers = {
  onRequestStart: () => undefined,
  onSessionCreated: () => undefined,
  onTargetLeave: () => null,
};

interface PlaybackSourceOptions {
  playable: PlayableRef;
  title: string;
  /** The player decodes through Samsung's AVPlay. */
  avplay: boolean;
  /**
   * The subtitle preferences key of this target (it follows the signed-in user). It
   * does not start a new session; the current one follows it through `sessionSubtitleKey`.
   */
  subtitleKey: string;
}

/**
 * Create the playback session for a target and walk its sources: a source whose stream fails
 * is reported to the backend through `avoidSourceIds`, so the next session brings the next
 * candidate; a repeat, or nothing left to try, ends in an error that offers a retry.
 */
export function usePlaybackSource({ playable, title, avplay, subtitleKey }: PlaybackSourceOptions) {
  const dispatch = useDispatch<AppDispatch>();
  const [createSession, sessionRequest] = useCreateSessionMutation();
  const resetSessionRequestRef = useRef(sessionRequest.reset);
  resetSessionRequestRef.current = sessionRequest.reset;
  const resetSessionRequest = useCallback(() => resetSessionRequestRef.current(), []);
  const createdSession = sessionRequest.data ?? null;
  // Streams start before the file is probed; the probe's delivery arrives over realtime.
  const deliveryUpdate = useSelector(selectPlaybackDelivery(createdSession?.playbackId));
  const downloadedRanges = useSelector(selectPlaybackPieces(createdSession?.playbackId));
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
  /** The direct stream failed before the probe said how this file must be delivered. */
  const directFailedWhilePending = useRef(false);
  /**
   * Sources whose stream failed for this playable. The backend rules out fakes and stalled
   * swarms, so each new session normally brings the next candidate; a repeat ends the walk.
   */
  const failedSources = useRef<{ key: string; ids: Set<number> }>({ key: '', ids: new Set() });
  const pushedAttempt = useSelector(selectSourceAttempt(playable));
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PlaybackStatus>('checking');
  const [attempt, setAttempt] = useState(0);
  const requestId = useRef(0);
  const sessionInFlight = useRef<{
    key: string;
    promise: Promise<CreatePlaybackSessionResponse>;
  } | null>(null);
  /** The subtitle key of the current session; null while it is being requested. */
  const sessionSubtitleKey = useRef<string | null>(null);
  const handlers = useRef<PlaybackSessionHandlers>(noHandlers);
  // Read when a session settles, not dependencies of the session effect: a new title or subtitle
  // key must not rerun the request lifecycle (status, progress and audio resets) on a live session.
  const titleRef = useRef(title);
  titleRef.current = title;
  const subtitleKeyRef = useRef(subtitleKey);
  subtitleKeyRef.current = subtitleKey;

  useEffect(() => {
    if (sessionSubtitleKey.current !== null) sessionSubtitleKey.current = subtitleKey;
  }, [subtitleKey]);

  /** Playback cannot go on: show the error and drop the session. */
  const failPlayback = useCallback(
    (message: string) => {
      setStatus('error');
      setError(message);
      resetSessionRequest();
    },
    [resetSessionRequest]
  );

  /** Ask for a new session, for example when the backend says the current one must be recreated. */
  const restartSession = useCallback(() => setAttempt(value => value + 1), []);

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

  /** The media element rejected the stream. */
  const handleMediaError = useCallback(() => {
    // The browser may reject an unprobed file whose audio needs transcoding;
    // the pending delivery decides whether that is a real failure.
    if (session?.deliveryPending) {
      directFailedWhilePending.current = true;
      return;
    }
    failSource();
  }, [failSource, session?.deliveryPending]);

  /** The probe decided how the file is delivered: settle a direct-stream failure seen meanwhile. */
  const settlePendingFailure = useCallback(
    (mode: 'direct' | 'audio-transcode') => {
      if (mode === 'audio-transcode') {
        directFailedWhilePending.current = false;
      } else if (directFailedWhilePending.current) {
        directFailedWhilePending.current = false;
        failSource();
      }
    },
    [failSource]
  );

  /** Start over from the first source, after a failure. */
  const retry = useCallback(() => {
    failedSources.current = { key: '', ids: new Set() };
    setError(null);
    setStatus('checking');
    setAttempt(value => value + 1);
  }, []);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    const { onRequestStart, onSessionCreated, onTargetLeave } = handlers.current;
    directFailedWhilePending.current = false;
    sessionSubtitleKey.current = null;
    const sessionKey = JSON.stringify([playable, attempt]);
    if (sessionInFlight.current?.key !== sessionKey) {
      resetSessionRequest();
      dispatch(realtimeActions.sourceAttemptCleared(playable));
    }
    setError(null);
    setStatus('preparing');
    onRequestStart();

    // Sources this player already failed to play: the backend cannot see a browser rejection.
    const avoidSourceIds =
      failedSources.current.key === JSON.stringify(playable) ? [...failedSources.current.ids] : [];
    if (sessionInFlight.current?.key !== sessionKey)
      sessionInFlight.current = {
        key: sessionKey,
        promise: createSession({
          playable,
          ...(avoidSourceIds.length ? { avoidSourceIds } : {}),
          preferences: playbackPreferences(avplay),
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
            `Playback for “${titleRef.current}” could not load any of its sources. Retry to try source preparation again.`
          );
          return;
        }
        setStatus(result.preparation.state === 'warm' ? 'ready' : 'preparing');
        onSessionCreated(result);
        sessionSubtitleKey.current = subtitleKeyRef.current;
      })
      .catch((reason: unknown) => {
        if (currentRequest !== requestId.current) return;
        if (isUnavailablePlaybackFailure(reason) && avoidSourceIds.length) {
          // Only sources that already failed here are left.
          setStatus('error');
          setError(
            `Playback for “${titleRef.current}” could not load any of its sources. Retry to try source preparation again.`
          );
          return;
        }
        if (isUnavailablePlaybackFailure(reason)) {
          // No source exists, or every one proved fake: offer to notify once one is out.
          setStatus('exhausted');
          return;
        }
        setStatus('error');
        setError(describePlaybackFailure(reason, titleRef.current));
      });

    return () => {
      requestId.current += 1;
      const cleanupRequest = requestId.current;
      const leave = onTargetLeave(playable);
      queueMicrotask(() => {
        // StrictMode immediately sets up the same target again. A real target change
        // still runs the old target's leave (its progress save) before its refs are reused.
        if (
          leave &&
          (requestId.current === cleanupRequest || sessionInFlight.current?.key !== sessionKey)
        ) {
          leave();
        }
      });
    };
  }, [attempt, avplay, createSession, playable, resetSessionRequest, dispatch]);

  return {
    session,
    deliveryUpdate,
    downloadedRanges,
    /** The realtime source attempt, else the one the session was created with. */
    sourceAttempt: pushedAttempt ?? session?.sourceAttempt ?? null,
    status,
    setStatus,
    error,
    failPlayback,
    failSource,
    restartSession,
    retry,
    handleMediaError,
    settlePendingFailure,
    sessionSubtitleKey,
    /** Set by the player during render; read when the request effect runs. */
    handlers,
  };
}

export type PlaybackSource = ReturnType<typeof usePlaybackSource>;
