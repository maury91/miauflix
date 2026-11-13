export type PlaybackStatus =
  | 'checking'
  | 'preparing'
  | 'ready'
  | 'unavailable'
  | 'exhausted'
  | 'error';

interface PlaybackFailure {
  status?: number;
  data?: unknown;
}

function getFailureDetails(reason: unknown): PlaybackFailure {
  if (typeof reason !== 'object' || reason === null) return {};
  return reason as PlaybackFailure;
}

export function isUnavailablePlaybackFailure(reason: unknown): boolean {
  return getFailureDetails(reason).status === 404;
}

/** Shown while the player works through the candidates. */
export function getSourceAttemptMessage(
  attempt: { position: number; total: number },
  title: string
): string {
  return `Trying source ${attempt.position} of ${attempt.total} for “${title}”…`;
}

/** Every source was tried (or none exists): offer to notify once one is out. */
export function getNoSourceMessage(title: string): string {
  return `There is no source for “${title}”. Press “Notify me” to receive a notification once it's out.`;
}

export function describePlaybackFailure(reason: unknown, title: string): string {
  const { status, data } = getFailureDetails(reason);
  const quotedTitle = `“${title}”`;

  if (isUnavailablePlaybackFailure(reason)) {
    return `No playable source is available for ${quotedTitle} yet. Try again later, or choose another title.`;
  }
  if (status === 401 || status === 403) {
    return `Your session cannot access playback for ${quotedTitle}. Sign in again, then retry.`;
  }
  if (status === 429) {
    return `Playback checks for ${quotedTitle} are temporarily limited. Wait a moment, then retry.`;
  }
  if (status === 422 && typeof data === 'string' && data.trim()) {
    return `Playback for ${quotedTitle} could not start: ${data}`;
  }
  if (status === 0) {
    return `Miauflix could not reach the playback service for ${quotedTitle}. Check your connection, then retry.`;
  }
  if (status !== undefined && status >= 500) {
    return `The source for ${quotedTitle} could not be prepared. Retry or choose another title.`;
  }
  return `Playback for ${quotedTitle} could not start. Retry to try source preparation again.`;
}

export function getPlaybackStatusMessage(status: PlaybackStatus, title: string): string {
  const quotedTitle = `“${title}”`;
  switch (status) {
    case 'checking':
      return `Checking sources for ${quotedTitle}…`;
    case 'preparing':
      return `Preparing ${quotedTitle} for playback…`;
    case 'ready':
      return `Ready to play ${quotedTitle}.`;
    case 'unavailable':
      return `No playable source is available for ${quotedTitle} yet.`;
    case 'exhausted':
      return getNoSourceMessage(title);
    case 'error':
      return `Playback for ${quotedTitle} could not start.`;
  }
}
